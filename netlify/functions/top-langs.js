// --- Imports ---
// Remember to adjust paths based on your actual project structure
// relative to where this function file is located (e.g., netlify/functions/top-langs.js).
const { renderTopLanguages } = require("../../src/cards/top-languages-card");
const { blacklist } = require("../../src/common/blacklist");
const {
  CONSTANTS,
  parseArray,
  parseBoolean,
  renderError,
} = require("../../src/common/utils");
const { fetchTopLanguages } = require("../../src/fetchers/top-languages-fetcher");
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
    hide,
    hide_title,
    hide_border,
    card_width,
    title_color,
    text_color,
    bg_color,
    theme,
    cache_seconds,
    layout,
    langs_count,
    exclude_repo,
    size_weight,
    count_weight,
    custom_title,
    locale,
    border_radius,
    border_color,
    disable_animations,
    hide_progress,
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
    body = renderError("Something went wrong", "Locale not found", { // Added theme parameters for error rendering
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
    return { statusCode, headers, body }; // Return early on validation error.
  }

  // --- Input Validation: Layout Type ---
  if (
    layout !== undefined &&
    (typeof layout !== "string" ||
      !["compact", "normal", "donut", "donut-vertical", "pie"].includes(layout))
  ) {
    statusCode = 400; // Bad Request status for incorrect layout input.
    body = renderError("Something went wrong", "Incorrect layout input", { // Added theme parameters for error rendering
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
    return { statusCode, headers, body }; // Return early on validation error.
  }

  try {
    const topLangs = await fetchTopLanguages(
      username,
      parseArray(exclude_repo),
      size_weight,
      count_weight,
    );

    // --- Cache Control Logic ---
    let cacheSeconds = parseInt(
      cache_seconds || CONSTANTS.TOP_LANGS_CACHE_SECONDS,
      10,
    );
    // Prioritize CACHE_SECONDS from environment variables if set.
    cacheSeconds = process.env.CACHE_SECONDS
      ? parseInt(process.env.CACHE_SECONDS, 10) || cacheSeconds
      : cacheSeconds;

    headers["Cache-Control"] = `max-age=${cacheSeconds / 2}, s-maxage=${cacheSeconds}`;

    // --- Render Top Languages Card ---
    body = renderTopLanguages(topLangs, {
      custom_title,
      hide_title: parseBoolean(hide_title),
      hide_border: parseBoolean(hide_border),
      card_width: parseInt(card_width, 10),
      hide: parseArray(hide),
      title_color,
      text_color,
      bg_color,
      theme,
      layout,
      langs_count,
      border_radius,
      border_color,
      locale: locale ? locale.toLowerCase() : null,
      disable_animations: parseBoolean(disable_animations),
      hide_progress: parseBoolean(hide_progress),
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
