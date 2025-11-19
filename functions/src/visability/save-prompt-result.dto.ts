export enum SentimentEnum {
  positive = "positive",
  neutral = "neutral",
  negative = "negative",
}

export enum ProviderEnum {
  GPT = "openai-gpt",
  Perp = "perplexity-ai",
}

export class BrandRowDto {
  brand!: string;
  key!: string;
  visibility_pct!: number;
  mentions!: number;
  sentiment?: {
    positive: number;
    neutral: number;
    negative: number;
  };
  isMain!: boolean;
}

export class DomainRowDto {
  domain!: string;
  used_pct!: number;
  cited_links!: string[];
}

export class CitedDto {
  url!: string;
  domain!: string;
  brandName!: string;
  type!: string;
  isMentioned!: boolean;
}

export class SavePromptResultDto {
  promptId!: string;

  brandId!: string;

  promptText!: string;

  runDate!: string;

  responseText!: string;

  sentiment!: SentimentEnum;

  provider!: ProviderEnum;

  cited!: CitedDto[];
}
