// --- Imports ---
// Use CommonJS syntax (require) for Netlify Functions.
// Adjust paths based on your actual project structure relative to this function file.
const { renderStatsCard } = require("../../src/cards/stats-card");
const { blacklist } = require("../../src/common/blacklist");
const {
  clampValue,
  CONSTANTS,
  parseArray,
  parseBoolean,
  renderError,
} = require("../../src/common/utils");
const { fetchStats } = require("../../src/fetchers/stats-fetcher");
const { isLocaleAvailable } = require("../../src/translations");

/**
 * @param {object} event The Netlify Function event object.
 * @param {object} context The Netlify Function context object.
 * @returns {Promise<object>} The Netlify Function response object.
 */
exports.handler = async (event, context) => {
  // --- Accessing Query Parameters ---
  // Use event.queryStringParameters instead of req.query
  const {
    username,
    hide,
    hide_title,
    hide_border,
    card_width,
    hide_rank,
    show_icons,
    include_all_commits,
    line_height,
    title_color,
    ring_color,
    icon_color,
    text_color,
    text_bold,
    bg_color,
    theme,
    cache_seconds,
    exclude_repo,
    custom_title,
    locale,
    disable_animations,
    border_radius,
    number_format,
    border_color,
    rank_icon,
    show,
  } = event.queryStringParameters;

  // --- Initialize Response Properties ---
  let statusCode = 200;
  let headers = {
    "Content-Type": "image/svg+xml", // Default content type for SVG
  };
  let body = "";

  // --- Input Validation ---
  if (blacklist.includes(username)) {
    statusCode = 403; // Forbidden
    body = renderError("Something went wrong", "This username is blacklisted", {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    });
    // Return early for validation errors
    return { statusCode, headers, body };
  }

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
    const showStats = parseArray(show);
    const stats = await fetchStats(
      username,
      parseBoolean(include_all_commits),
      parseArray(exclude_repo),
      showStats.includes("prs_merged") ||
        showStats.includes("prs_merged_percentage"),
      showStats.includes("discussions_started"),
      showStats.includes("discussions_answered"),
    );

    let cacheSeconds = clampValue(
      parseInt(cache_seconds || CONSTANTS.CARD_CACHE_SECONDS, 10),
      CONSTANTS.TWELVE_HOURS,
      CONSTANTS.TWO_DAY,
    );
    // Access environment variables from process.env
    cacheSeconds = process.env.CACHE_SECONDS
      ? parseInt(process.env.CACHE_SECONDS, 10) || cacheSeconds
      : cacheSeconds;

    // --- Setting Cache-Control Header ---
    headers["Cache-Control"] = `max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=${CONSTANTS.ONE_DAY}`;

    // --- Rendering the Stats Card ---
    body = renderStatsCard(stats, {
      hide: parseArray(hide),
      show_icons: parseBoolean(show_icons),
      hide_title: parseBoolean(hide_title),
      hide_border: parseBoolean(hide_border),
      card_width: parseInt(card_width, 10),
      hide_rank: parseBoolean(hide_rank),
      include_all_commits: parseBoolean(include_all_commits),
      line_height,
      title_color,
      ring_color,
      icon_color,
      text_color,
      text_bold: parseBoolean(text_bold),
      bg_color,
      theme,
      custom_title,
      border_radius,
      border_color,
      number_format,
      locale: locale ? locale.toLowerCase() : null,
      disable_animations: parseBoolean(disable_animations),
      rank_icon,
      show: showStats,
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
