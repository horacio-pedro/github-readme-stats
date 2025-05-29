// --- Imports ---
// Remember to adjust paths based on your actual project structure
// relative to where this function file is located (e.g., netlify/functions/pin.js).
const { renderRepoCard } = require("../../src/cards/repo-card");
const { blacklist } = require("../../src/common/blacklist");
const {
  clampValue,
  CONSTANTS,
  parseBoolean,
  renderError,
} = require("../../src/common/utils");
const { fetchRepo } = require("../../src/fetchers/repo-fetcher");
const { isLocaleAvailable } = require("../../src/translations");

/**
 * @param {object} event The Netlify Function event object.
 * @param {object} context The Netlify Function context object.
 * @returns {Promise<object>} The Netlify Function response object.
 */
exports.handler = async (event, context) => {
  // --- Accessing Query Parameters ---
  // Use event.queryStringParameters to get URL parameters.
  const {
    username,
    repo,
    hide_border,
    title_color,
    icon_color,
    text_color,
    bg_color,
    theme,
    show_owner,
    cache_seconds,
    locale,
    border_radius,
    border_color,
    description_lines_count,
  } = event.queryStringParameters;

  // --- Initialize Response Properties ---
  let statusCode = 200;
  let headers = {
    "Content-Type": "image/svg+xml", // Default content type for SVG responses.
  };
  let body = ""; // The response body will be an SVG string.

  // --- Input Validation: Blacklisted Username ---
  if (blacklist.includes(username)) {
    statusCode = 403; // Forbidden status for blacklisted users.
    body = renderError("Something went wrong", "This username is blacklisted", {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
    return { statusCode, headers, body }; // Return early on validation error.
  }

  // --- Input Validation: Language Availability ---
  if (locale && !isLocaleAvailable(locale)) {
    statusCode = 400; // Bad Request status for invalid locale.
    body = renderError("Something went wrong", "Language not found", {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
    return { statusCode, headers, body }; // Return early on validation error.
  }

  try {
    const repoData = await fetchRepo(username, repo);

    // --- Cache Control Logic ---
    let cacheSeconds = clampValue(
      parseInt(cache_seconds || CONSTANTS.PIN_CARD_CACHE_SECONDS, 10),
      CONSTANTS.ONE_DAY,
      CONSTANTS.TEN_DAY,
    );
    // Prioritize CACHE_SECONDS from environment variables if set.
    cacheSeconds = process.env.CACHE_SECONDS
      ? parseInt(process.env.CACHE_SECONDS, 10) || cacheSeconds
      : cacheSeconds;

    headers["Cache-Control"] = `max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`;

    // --- Render Repo Card ---
    body = renderRepoCard(repoData, {
      hide_border: parseBoolean(hide_border),
      title_color,
      icon_color,
      text_color,
      bg_color,
      theme,
      border_radius,
      border_color,
      show_owner: parseBoolean(show_owner),
      locale: locale ? locale.toLowerCase() : null,
      description_lines_count,
    });

  } catch (err) {
    // --- Error Handling ---
    statusCode = 500; // Internal Server Error for caught exceptions.
    // Set cache headers for errors to allow revalidation.
    headers["Cache-Control"] = `max-age=${CONSTANTS.ERROR_CACHE_SECONDS / 2}, s-maxage=${
      CONSTANTS.ERROR_CACHE_SECONDS
    }, stale-while-revalidate=${CONSTANTS.ONE_DAY}`;
    body = renderError(err.message, err.secondaryMessage, {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
  }

  // --- Return Netlify Function Response ---
  return {
    statusCode,
    headers,
    body,
  };
};
