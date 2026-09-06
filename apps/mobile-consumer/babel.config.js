// Source: https://docs.expo.dev/versions/v53.0.0/config/babel/
/** @type {import('babel-preset-expo').BabelPreset} */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
