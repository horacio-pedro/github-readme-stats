// --- Imports ---
// Use CommonJS syntax (require) for Netlify Functions.
// Adjust paths based on your actual project structure relative to this function file.
const {
  clampValue,
  CONSTANTS,
  renderError,
  parseBoolean,
} = require("../../src/common/utils");
const { isLocaleAvailable } = require("../../src/translations");
const { renderGistCard } = require("../../src/cards/gist-card");
const { fetchGist } = require("../../src/fetchers/gist-fetcher");

/**
 * @param {object} event The Netlify Function event object.
 * @param {object} context The Netlify Function context object.
 * @returns {Promise<object>} The Netlify Function response object.
 */
exports.handler = async (event, context) => {
  // --- Accessing Query Parameters ---
  // Use event.queryStringParameters instead of req.query
  const {
    id,
    title_color,
    icon_color,
    text_color,
    bg_color,
    theme,
    cache_seconds,
    locale,
    border_radius,
    border_color,
    show_owner,
    hide_border,
  } = event.queryStringParameters;

  // --- Initialize Response Properties ---
  let statusCode = 200;
  let headers = {
    "Content-Type": "image/svg+xml", // Default content type for SVG
  };
  let body = "";

  // --- Input Validation ---
  if (locale && !isLocaleAvailable(locale)) {
    statusCode = 400; // Bad Request
    body = renderError("Something went wrong", "Language not found", {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
    // Return early for validation errors
    return { statusCode, headers, body };
  }

  try {
    const gistData = await fetchGist(id);

    let cacheSeconds = clampValue(
      parseInt(cache_seconds || CONSTANTS.TWO_DAY, 10),
      CONSTANTS.TWO_DAY,
      CONSTANTS.SIX_DAY,
    );
    // Access environment variables from process.env
    cacheSeconds = process.env.CACHE_SECONDS
      ? parseInt(process.env.CACHE_SECONDS, 10) || cacheSeconds
      : cacheSeconds;

    // --- Setting Cache-Control Header ---
    headers["Cache-Control"] = `max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`;

    // --- Rendering the Gist Card ---
    body = renderGistCard(gistData, {
      title_color,
      icon_color,
      text_color,
      bg_color,
      theme,
      border_radius,
      border_color,
      locale: locale ? locale.toLowerCase() : null,
      show_owner: parseBoolean(show_owner),
      hide_border: parseBoolean(hide_border),
    });

  } catch (err) {
    // --- Error Handling and Cache Control for Errors ---
    statusCode = 500; // Internal Server Error
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

  // --- Return the Netlify Function Response Object ---
  return {
    statusCode,
    headers,
    body,
  };
};
