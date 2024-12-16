const { StatusCodes } = require('http-status-codes');

/**
 * BaseResponse Service
 * Handles success and error responses.
 */
class BaseResponse {
  /**
   * Error response with exception.
   * @param {Error} error - The exception object.
   * @returns {Object} Response payload.
   */
  errorResponse(error) {
    return {
      response: false,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      message: error.message || 'Internal Server Error',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Error response with message and exception.
   * @param {string} message - Error message.
   * @param {Error} error - The exception object.
   * @returns {Object} Response payload.
   */
  errorResponseWithMessage(message, error) {
    return {
      response: false,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      message: message || 'An error occurred',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Error response with status and data.
   * @param {number} status - HTTP status code.
   * @param {Object} data - Error data.
   * @returns {Object} Response payload.
   */
  errorResponseWithData(status, data) {
    return {
      response: false,
      status: status || StatusCodes.INTERNAL_SERVER_ERROR,
      data: data || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Success response with data.
   * @param {Object} data - Response data.
   * @returns {Object} Response payload.
   */
  successResponse(data) {
    return {
      response: true,
      status: StatusCodes.OK,
      message: 'Success',
      data: data || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Success response with message and data.
   * @param {string} message - Success message.
   * @param {Object} data - Response data.
   * @returns {Object} Response payload.
   */
  successResponseWithMessage(message, data) {
    return {
      response: true,
      status: StatusCodes.OK,
      message: message || 'Success',
      data: data || null,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new BaseResponse();
