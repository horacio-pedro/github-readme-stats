/**
 * @file Contains a simple cloud function that can be used to check which PATs are no
 * longer working. It returns a list of valid PATs, expired PATs and PATs with errors.
 *
 * @description This function is currently rate limited to 1 request per 5 minutes.
 */

// Use CommonJS syntax (require) for Netlify Functions, and adjust paths.
// Ensure these paths are correct relative to where this function file is located.
// For example, if this file is in `netlify/functions/status-pat-info.js` and common is in `src/common`,
// you might need `../../src/common/utils.js`.
const { logger, request, dateDiff } = require("../../../src/common/utils");

// Export the rate limit constant
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
            resetAt
          },
        }`,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

const getAllPATs = () => {
  // Access process.env directly; Netlify injects environment variables here.
  return Object.keys(process.env).filter((key) => /PAT_\d*$/.exec(key));
};

/**
 * @typedef {(variables: AxiosRequestHeaders, token: string) => Promise<AxiosResponse>} Fetcher The fetcher function.
 * @typedef {{validPATs: string[], expiredPATs: string[], exhaustedPATs: string[], suspendedPATs: string[], errorPATs: string[], details: any}} PATInfo The PAT info.
 */

/**
 * Check whether any of the PATs is expired.
 *
 * @param {Fetcher} fetcher The fetcher function.
 * @param {AxiosRequestHeaders} variables Fetcher variables.
 * @returns {Promise<PATInfo>} The response.
 */
const getPATInfo = async (fetcher, variables) => {
  const details = {};
  const PATs = getAllPATs();

  for (const pat of PATs) {
    try {
      const response = await fetcher(variables, process.env[pat]);
      const errors = response.data.errors;
      const hasErrors = Boolean(errors);
      const errorType = errors?.[0]?.type;
      const isRateLimited =
        (hasErrors && errorType === "RATE_LIMITED") ||
        response.data.data?.rateLimit?.remaining === 0;

      // Store PATs with errors.
      if (hasErrors && errorType !== "RATE_LIMITED") {
        details[pat] = {
          status: "error",
          error: {
            type: errors[0].type,
            message: errors[0].message,
          },
        };
        continue;
      } else if (isRateLimited) {
        const date1 = new Date();
        const date2 = new Date(response.data?.data?.rateLimit?.resetAt);
        details[pat] = {
          status: "exhausted",
          remaining: 0,
          resetIn: dateDiff(date2, date1) + " minutes",
        };
      } else {
        details[pat] = {
          status: "valid",
          remaining: response.data.data.rateLimit.remaining,
        };
      }
    } catch (err) {
      // Store the PAT if it is expired.
      const errorMessage = err.response?.data?.message?.toLowerCase();
      if (errorMessage === "bad credentials") {
        details[pat] = {
          status: "expired",
        };
      } else if (errorMessage === "sorry. your account was suspended.") {
        details[pat] = {
          status: "suspended",
        };
      } else {
        // Re-throw if it's an unexpected error, so the main handler catches it.
        throw err;
      }
    }
  }

  const filterPATsByStatus = (status) => {
    return Object.keys(details).filter((pat) => details[pat].status === status);
  };

  const sortedDetails = Object.keys(details)
    .sort()
    .reduce((obj, key) => {
      obj[key] = details[key];
      return obj;
    }, {});

  return {
    validPATs: filterPATsByStatus("valid"),
    expiredPATs: filterPATsByStatus("expired"),
    exhaustedPATs: filterPATsByStatus("exhausted"),
    suspendedPATs: filterPATsByStatus("suspended"),
    errorPATs: filterPATsByStatus("error"),
    details: sortedDetails,
  };
};

/**
 * Cloud function that returns information about the used PATs.
 *
 * @param {object} event The Netlify Function event object.
 * @param {object} context The Netlify Function context object.
 * @returns {Promise<object>} The Netlify Function response object.
 */
exports.handler = async (event, context) => { // Changed to exports.handler
  let statusCode = 200;
  let headers = {
    "Content-Type": "application/json",
  };
  let body = "";

  try {
    // getPATInfo does not need event/context, as it uses process.env directly.
    const PATsInfo = await getPATInfo(uptimeFetcher, {});

    // headers are built into the returned object, not set via res.setHeader
    headers["Cache-Control"] = `max-age=0, s-maxage=${RATE_LIMIT_SECONDS}`;
    
    // Stringify the JSON response for the body
    body = JSON.stringify(PATsInfo, null, 2);

  } catch (err) {
    // Log the error using console.error for Netlify Function logs
    console.error("PAT Info Function error:", err);
    statusCode = 500;
    headers = { // Reset headers for error response
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
