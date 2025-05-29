/**
 * @file Contains a simple cloud function that can be used to check if the PATs are still
 * functional.
 *
 * @description This function is currently rate limited to 1 request per 5 minutes.
 */

// Use CommonJS syntax (require) for Netlify Functions, and adjust paths.
// Ensure these paths are correct relative to where this function file is located.
// For example, if this file is in `netlify/functions/uptime.js` and common is in `src/common`,
// you might need `../../src/common/retryer.js`.
const retryer = require("../../../src/common/retryer");
const { logger, request } = require("../../../src/common/utils"); // Assuming logger and request are in utils.js

// Export the rate limit constant for clarity
const RATE_LIMIT_SECONDS = 60 * 5; // 1 request per 5 minutes

/**
 * @typedef {import('axios').AxiosRequestHeaders} AxiosRequestHeaders Axios request headers.
 * @typedef {import('axios').AxiosResponse} AxiosResponse Axios response.
 */

/**
 * Simple uptime check fetcher for the PATs.
 *
 * @param {AxiosRequestHeaders} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<AxiosResponse>} The response.
 */
const uptimeFetcher = (variables, token) => {
  return request(
    {
      query: `
        query {
          rateLimit {
              remaining
          }
        }
        `,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

/**
 * @typedef {{
 * schemaVersion: number;
 * label: string;
 * message: "up" | "down";
 * color: "brightgreen" | "red";
 * isError: boolean
 * }} ShieldsResponse Shields.io response object.
 */

/**
 * Creates Json response that can be used for shields.io dynamic card generation.
 *
 * @param {boolean} up Whether the PATs are up or not.
 * @returns {ShieldsResponse}  Dynamic shields.io JSON response object.
 *
 * @see https://shields.io/endpoint.
 */
const shieldsUptimeBadge = (up) => {
  const schemaVersion = 1;
  // Note: The original code had `isError: true` here.
  // For Shields.io, `isError` is typically `false` for a successful badge
  // and `true` only if the endpoint itself failed to produce a valid response.
  // Let's set it to false if everything is fine, true if there's an internal error.
  const isError = false; 
  const label = "Public Instance";
  const message = up ? "up" : "down";
  const color = up ? "brightgreen" : "red";
  return {
    schemaVersion,
    label,
    message,
    color,
    isError,
  };
};

/**
 * Cloud function that returns whether the PATs are still functional.
 *
 * @param {object} event The Netlify Function event object.
 * @param {object} context The Netlify Function context object.
 * @returns {Promise<object>} The Netlify Function response object.
 */
exports.handler = async (event, context) => { // Changed to exports.handler for Netlify
  // Access query parameters from event.queryStringParameters
  let { type } = event.queryStringParameters;
  type = type ? type.toLowerCase() : "boolean";

  // Initialize response properties
  let statusCode = 200;
  let headers = {
    "Content-Type": "application/json", // Default content type, can be overridden
  };
  let body = "";

  try {
    let PATsValid = true;
    try {
      // In a real scenario, you might need to pass a GitHub token to uptimeFetcher.
      // This token would come from Netlify environment variables (e.g., process.env.GH_TOKEN).
      await retryer(uptimeFetcher, {}); 
    } catch (err) {
      // Log the error for debugging in Netlify Function logs
      console.error("Uptime fetcher error:", err); 
      PATsValid = false;
    }

    if (PATsValid) {
      headers["Cache-Control"] = `max-age=0, s-maxage=${RATE_LIMIT_SECONDS}`;
    } else {
      headers["Cache-Control"] = "no-store";
    }

    switch (type) {
      case "shields":
        body = JSON.stringify(shieldsUptimeBadge(PATsValid)); // Shields.io expects JSON
        headers["Content-Type"] = "application/json"; // Ensure content type is JSON for Shields.io
        break;
      case "json":
        body = JSON.stringify({ up: PATsValid }); // Stringify JSON object for the body
        break;
      default:
        body = String(PATsValid); // Convert boolean to string for plain text/default response
        headers["Content-Type"] = "text/plain"; // Explicitly set for boolean/plain text
        break;
    }
  } catch (err) {
    // Log the error using console.error for Netlify Function logs
    console.error("Function general error:", err);
    statusCode = 500; // Set status code for internal server error
    headers = { // Reset headers for an error response
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    };
    body = "Something went wrong: " + err.message;
  }

  // Return the response object in Netlify Function's expected format
  return {
    statusCode,
    headers,
    body,
  };
};
