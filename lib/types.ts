export type SourceType = "url" | "text";

export type EpisodeCreateInput = {
  source: {
    type: SourceType;
    value: string;
    parsedClaim: string;
    parsedTensions: string[];
    parsedQuestions: string[];
  };
  cast: {
    moderatorId: string;
    panelistIds: string[];
    guestPrompt?: string;
  };
  controls: {
    seriousness: number;
    humor: number;
    confrontation: number;
    durationMinutes: number;
  };
};

export type DebateStepAction =
  | "auto"
  | "normal"
  | "push_harder"
  | "get_concrete"
  | "time_check"
  | "close_show"
  | "creator_followup";

export type ParseSourceResponse = {
  claim: string;
  tensions: string[];
  tensionEvidence?: string[];
  openQuestions: string[];
  sourceTitle?: string;
  sourceExcerpt?: string;
  mode?: "llm" | "heuristic" | "fallback";
  warning?: string;
};
