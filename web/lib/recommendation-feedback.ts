export const feedbackOptions=[['','No feedback'],['good','Good fit'],['experience','Not for me — experience'],['skills','Not for me — skills'],['role','Not for me — role'],['location','Not for me — location'],['other','Not for me — other']] as const;
export type RecommendationFeedback=typeof feedbackOptions[number][0];
export function cleanFeedback(value:unknown):RecommendationFeedback {return feedbackOptions.some(([key])=>key===value)?value as RecommendationFeedback:'';}
export function negativeFeedback(value:unknown) {return Boolean(cleanFeedback(value)&&value!=='good');}
export function learningLabel(record:{feedback?:string;saved?:boolean;status?:string}) {
 if(record.feedback==='good')return 1;
 // These are reports of data/eligibility problems, not evidence against an
 // otherwise relevant role family. Keep them out of preference training.
 if(record.feedback==='experience'||record.feedback==='location')return null;
 if(negativeFeedback(record.feedback)||record.status==='Ignored')return 0;
 if(record.status==='Rejected')return null;
 return record.saved||['Applied','Interview','Offer'].includes(record.status||'')?1:null;
}
export function hideRecommendation(record:{feedback?:string;status?:string}) {return record.feedback==='good'?false:record.status==='Ignored'||negativeFeedback(record.feedback);}

export function preferenceTime(prior:{preference_at?:string;updated_at?:string},patch:{feedback?:string;saved?:boolean;status?:string},now:string) {
 return 'feedback' in patch||'saved' in patch||(patch.status&&['Applied','Interview','Offer','Ignored'].includes(patch.status))?now:prior.preference_at||prior.updated_at||now;
}
