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
  | "normal"
  | "push_harder"
  | "get_concrete"
  | "time_check"
  | "creator_followup";

export type ParseSourceResponse = {
  claim: string;
  tensions: string[];
  openQuestions: string[];
};
