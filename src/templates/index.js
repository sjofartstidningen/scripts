const _ = require('lodash');

const packageJson = _.template(
  `{
  "name": "@sjofartstidningen/<%= _.kebabCase(pluginName) %>",
  "version": "1.0.0",
  "description": "<%= description %>",
  "main": "dist/<%= _.kebabCase(pluginName) %>.js",
  "repository": "<%= package.repository %>",
  "homepage": "<%= package.homepage %>",
  "author": "<%= package.author %>",
  "license": "<%= package.license %>",
  "private": true,
  "scripts": {
    "start": "parcel serve src/<%= _.kebabCase(pluginName) %>.js --hmr-hostname localhost --public-url .",
    "build": "parcel build src/<%= _.kebabCase(pluginName) %>.js --public-url .",
    "postbuild": "sst make-json",
    "postinstall": "sst make-aliases",
    "i18n:generate": "sst make-pot"
  },
  "dependencies": {},
  "devDependencies": {
    "@babel/core": "^7.4.5",
    "@babel/preset-env": "^7.4.5",
    "@babel/preset-react": "^7.0.0",
    "@sjofartstidningen/scripts": "^1.0.0",
    "babel-plugin-transform-react-remove-prop-types": "^0.4.24",
    "parcel-bundler": "^1.12.3"
  },
  "alias": {},
  "wp": {
    "entrypoints": ["src/<%= _.kebabCase(pluginName) %>.js"]
  }
}
`,
);

const plugin = _.template(
  `<?php
/**
 * @wordpress-plugin
 * Plugin Name: <%= _.capitalize(pluginName) %>
 * Description: <%= description %>
 * Version: 1.0.0
 * Author: <%= package.author %>
 * Author URI: <%= package.homepage %>
 * License: <%= package.license %>
 * Text Domain: <%= domain %>
 * Domain Path: /languages
 *
 * @link <%= package.homepage %>
 * @package <%= _.capitalize(pluginName) %>
 */

namespace SST\\<%= _.capitalize(_.camelCase(pluginName)) %>;

if (!defined('WPINC')) {
    die();
}


define('<%= _.toUpper(_.snakeCase(pluginName)) %>_VERSION', '1.0.0');
define('<%= _.toUpper(_.snakeCase(pluginName)) %>_URL', \\plugin_dir_url(__FILE__));
define('<%= _.toUpper(_.snakeCase(pluginName)) %>_PATH', \\plugin_dir_path(__FILE__));

\\add_action('wp_enqueue_scripts', function () {
    $handle = '<%= _.kebabCase(pluginName) %>/script';
    \\wp_register_script(
        $handle,
        <%= _.toUpper(_.snakeCase(pluginName)) %>_PATH . '/dist/<%= _.kebabCase(pluginName) %>.js',
        [],
        <%= _.toUpper(_.snakeCase(pluginName)) %>_VERSION,
        true
    );

    \\wp_set_script_translations(
        $handle,
        '<%= domain %>',
        <%= _.toUpper(_.snakeCase(pluginName)) %>_PATH . '/dist'
    );

    \\wp_enqueue_script($handle);
});
`,
);

const jsEntry = _.template("console.log('<%= _.capitalize(pluginName) %>')");

const index = _.template('<?php // Silence is golden\n');

const babelrc = _.template(
  `{
  "presets": ["@babel/preset-env", "@babel/preset-react"],
  "env": {
    "production": {
      "plugins": ["transform-react-remove-prop-types"]
    }
  }
}
  `,
);

const gitignore = _.template(
  `node_modules
dist
.cache
`,
);

module.exports = {
  packageJson,
  plugin,
  jsEntry,
  index,
  babelrc,
  gitignore,
};
