"""Verify ad-hoc Mach-O code pages and bundle resource seals without Apple trust checks."""
import sys, pathlib, struct, hashlib, plistlib
root=pathlib.Path(sys.argv[1]); binaries=resources=0
for p in root.rglob('*'):
 if p.is_symlink() or not p.is_file(): continue
 with p.open('rb') as f: magic=f.read(4)
 if magic!=b'\xcf\xfa\xed\xfe': continue
 data=p.read_bytes(); ncmds=struct.unpack_from('<I',data,16)[0]; offset=32; sig=None
 for _ in range(ncmds):
  cmd,size=struct.unpack_from('<II',data,offset)
  if cmd==0x1d:
   start,length=struct.unpack_from('<II',data,offset+8); sig=data[start:start+length]
  offset+=size
 assert sig, f'Missing signature: {p}'
 assert struct.unpack_from('>I',sig)[0]==0xfade0cc0
 blobs={}
 for i in range(struct.unpack_from('>I',sig,8)[0]):
  kind,pos=struct.unpack_from('>II',sig,12+i*8); length=struct.unpack_from('>I',sig,pos+4)[0]; blobs[kind]=sig[pos:pos+length]
 cd=blobs[0]; version,flags,hashoff,ident,special,count,limit=struct.unpack_from('>7I',cd,8)
 assert flags&2, f'Not ad-hoc: {p}'
 hs,ht,platform,page=struct.unpack_from('4B',cd,36)
 if version>=0x20300 and limit==0xffffffff: limit=struct.unpack_from('>Q',cd,56)[0]
 algo={1:'sha1',2:'sha256',3:'sha256',4:'sha384'}[ht]
 digest=lambda b:hashlib.new(algo,b).digest()[:hs]
 assert count==(limit+(1<<page)-1)//(1<<page), f'Invalid slot count: {p}'
 for i in range(count):
  assert digest(data[i*(1<<page):min((i+1)*(1<<page),limit)])==cd[hashoff+i*hs:hashoff+(i+1)*hs], f'Code page mismatch: {p} {i}'
 for slot in (2,5,7):
  if slot in blobs and slot<=special:
   assert digest(blobs[slot])==cd[hashoff-slot*hs:hashoff-(slot-1)*hs], f'Special slot mismatch: {p}'
 if p.parent.name=='MacOS':
  contents=p.parent.parent
  for slot,rel in ((1,'Info.plist'),(3,'_CodeSignature/CodeResources')):
   f=contents/rel
   if special>=slot and f.exists(): assert digest(f.read_bytes())==cd[hashoff-slot*hs:hashoff-(slot-1)*hs], f'Bundle seal mismatch: {f}'
 binaries+=1
for seal in root.rglob('CodeResources'):
 if seal.is_symlink() or seal.parent.name!='_CodeSignature': continue
 base=seal.parent.parent
 manifest=plistlib.loads(seal.read_bytes())
 for rel,entry in manifest.get('files2',{}).items():
  f=base/rel
  if isinstance(entry,dict):
   if 'symlink' in entry:
    assert f.is_symlink() and str(f.readlink())==entry['symlink'], f'Symlink mismatch: {f}'
   for key,algo in (('hash','sha1'),('hash2','sha256')):
    if key in entry: assert f.is_file() and hashlib.new(algo,f.read_bytes()).digest()==entry[key], f'Resource mismatch: {f}'
  resources+=1
assert binaries>0
print(f'Verified {binaries} ad-hoc Mach-O code signatures and {resources} resource entries. Apple trust/notarization and native launch are not tested.')
