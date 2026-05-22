interface CustomErrorParams {
  message?: string;
  status?: number;
  validationErrors?: Record<string, any>;
  i18nKey?: string;
  replacements?: string[];
}

class CustomError extends Error {
  status: number;
  validationErrors: Record<string, any>;
  i18nKey?: string;
  replacements?: string[];
  constructor({
    message = "An error occurred",
    status = 500,
    validationErrors = {},
    i18nKey,
    replacements,
  }: CustomErrorParams) {
    super(message);
    this.status = status;
    this.validationErrors = validationErrors;
    this.i18nKey = i18nKey;
    this.replacements = replacements;
    // Set the prototype explicitly to ensure instanceof works correctly
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}

export default CustomError;
