// --- Imports ---
// Remember to adjust paths based on your actual project structure
// relative to where this function file is located (e.g., netlify/functions/wakatime.js).
const { renderWakatimeCard } = require("../../src/cards/wakatime-card");
const {
  clampValue,
  CONSTANTS,
  parseArray,
  parseBoolean,
  renderError,
} = require("../../src/common/utils");
const { fetchWakatimeStats } = require("../../src/fetchers/wakatime-fetcher");
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
    title_color,
    icon_color,
    hide_border,
    line_height,
    text_color,
    bg_color,
    theme,
    cache_seconds,
    hide_title,
    hide_progress,
    custom_title,
    locale,
    layout,
    langs_count,
    hide,
    api_domain,
    border_radius,
    border_color,
    display_format,
    disable_animations,
  } = event.queryStringParameters;

  // --- Initialize Response Properties ---
  let statusCode = 200;
  let headers = {
    "Content-Type": "image/svg+xml", // Default content type for SVG responses.
  };
  let body = ""; // The response body will be an SVG string.

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
    const stats = await fetchWakatimeStats({ username, api_domain });

    // --- Cache Control Logic ---
    let cacheSeconds = clampValue(
      parseInt(cache_seconds || CONSTANTS.CARD_CACHE_SECONDS, 10),
      CONSTANTS.SIX_HOURS,
      CONSTANTS.TWO_DAY,
    );
    // Prioritize CACHE_SECONDS from environment variables if set.
    cacheSeconds = process.env.CACHE_SECONDS
      ? parseInt(process.env.CACHE_SECONDS, 10) || cacheSeconds
      : cacheSeconds;

    headers["Cache-Control"] = `max-age=${
      cacheSeconds / 2
    }, s-maxage=${cacheSeconds}, stale-while-revalidate=${CONSTANTS.ONE_DAY}`;

    // --- Render Wakatime Card ---
    body = renderWakatimeCard(stats, {
      custom_title,
      hide_title: parseBoolean(hide_title),
      hide_border: parseBoolean(hide_border),
      hide: parseArray(hide),
      line_height,
      title_color,
      icon_color,
      text_color,
      bg_color,
      theme,
      hide_progress,
      border_radius,
      border_color,
      locale: locale ? locale.toLowerCase() : null,
      layout,
      langs_count,
      display_format,
      disable_animations: parseBoolean(disable_animations),
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
