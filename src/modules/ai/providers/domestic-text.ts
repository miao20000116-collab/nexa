/** @deprecated Import from openai-text-provider or provider-factory */
export {
  OpenAITextProvider as DomesticTextProvider,
  type OpenAITextProviderConfig,
} from "./openai-text-provider";
export { getPrimaryTextProvider as getDomesticTextProvider } from "./provider-factory";
