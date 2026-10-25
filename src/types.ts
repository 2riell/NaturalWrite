export type Category = 'Academic Essays' | 'Learning Journals' | 'Personal Reflections' | 'Research Writing' | 'Casual Messages' | 'Custom Writing Style';
export interface Preferences { useProfile:boolean; preserveStyle:boolean; strength:number; preserveVocabulary:boolean; preserveStructure:boolean; meaningVerification:boolean; rules:string[]; }
export interface Sample { id:string; name:string; category:string; text:string; createdAt:string; }
export interface Characteristics { summary:string; vocabulary:string; sentenceStructure:string; grammar:string; expressions:string; paragraphOrganization:string; formality:string; tone:string; examples:string; }
export interface Profile { id:string; name:string; category:string; samples:Sample[]; trainedAt:string|null; characteristics:Characteristics; metrics:Record<string,any>|null; preferences:Preferences; approvedExpressions:string[]; feedback:Feedback[]; }
export interface Feedback { id:string; kind:string; original:string; suggested:string; expression?:string; learn:boolean; createdAt:string; }
export interface Document { id:string; title:string; text:string; updatedAt:string; }
export interface Suggestion { id:string; start:number; end:number; original:string; replacement:string; reason:string; kind:'correction'|'clarity'|'style'|'requested'; warnings:string[]; }
export interface ProviderConfig { provider:'offline'|'openai'; endpoint:string; model:string; hasApiKey:boolean; }
export interface AppState { profiles:Profile[]; activeProfileId:string; documents:Document[]; provider:ProviderConfig; }
export interface RevisionResult { suggestions:Suggestion[]; engine:string; verification:string; }
export interface NaturalWriteAPI {
 load():Promise<AppState>;
 saveProfile(profile:Profile):Promise<Profile>;
 deleteProfile(id:string):Promise<void>;
 setActiveProfile(id:string):Promise<void>;
 saveDocument(document:Document):Promise<Document>;
 deleteDocument(id:string):Promise<void>;
 importSamples():Promise<Sample[]>;
 exportDocument(document:{title:string;text:string}):Promise<boolean>;
 revise(input:{text:string;profileId:string;instructions:string}):Promise<RevisionResult>;
 saveProviderConfig(input:{provider:'offline'|'openai';endpoint:string;model:string;apiKey?:string}):Promise<ProviderConfig>;
 openDataFolder():Promise<void>;
}
declare global { interface Window { naturalwrite:NaturalWriteAPI; } }
