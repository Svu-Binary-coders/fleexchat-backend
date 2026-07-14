class ServiceError extends Error {
  statusCode: number;
  errorCode: number;
  success: boolean;

  constructor(message: string, statusCode: number, errorCode: number = 0) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode || statusCode;
    this.success = false;
    this.name = "ServiceError";

    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

export default ServiceError;