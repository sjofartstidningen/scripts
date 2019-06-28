# @sjofartstidningen/scripts

A collections of scripts useful while developing WordPress sites. Mainly adapted
for developing [www.sjofartstidningen.se](https://www.sjofartstidningen.se).

Install the package as a development dependency inside your WordPress plugin or
theme.

## Installation

Install the package using `npm` or `yarn`:

```shell
$ npm install --save-dev @sjofartstidningen/scripts
$ yarn add --dev @sjofartstidningen/scripts
```

### Dependecies

Some of the scripts in this package need `wp-cli` to work. Make sure that it is
installad and available as `wp` in your environment. The commands require
atleast version `2.1.0` of `wp-cli` to work properly since that's the version
where the commands `wp i18n make-pot` and `wp i18n make-json` where introduced.

## Commands

### Requirements for all scripts

The scripts in here makes a few assumptions:

- All javascript source files are located inside `{project_root}/src`
- Translations are located inside `{project_root}/languages`
- Build files are outputted to `{project_root}/dist`
- The `dist`-directory also contains a `assets.json`-file with the following
  structure:
  ```json
  {
    "{filepath_relative_to_src}.js": "{filepath_relative_to_dist}.{maybe_with_hash?}.js"
  }
  ```
  The package
  [`parcel-plugin-assets-list`](https://github.com/dobesv/parcel-plugin-assets-list)
  does this for you.

### `sst-scripts make-pot`

The command `make-pot` is a glorified version of the `wp-cli` equivalent
`wp i18n make-pot`. But that command will fail while searching thru your
javascript files if the files contain any dynamic imports (`import('package')`).

What the script does is that it will comment out an line containing dynamic
imports before running the `make-pot` on them. And when it's done it will
restore the files as if nothing has happened.

The `.pot`-file will be named after the `name`-property in your `package.json`
and placed inside the `dist`-folder.

The pot-file can then be used as a base for further translations.

#### Usage

```shell
$ sst-scripts make-pot
```

_Preferably this should run after a build script._

### `sst-scripts make-json`

The command `make-json` is a glorified version of the `wp-cli` equivalent
`wp i18n make-json`. It will extract all translations related to your js-files
and properly name them and place them inside your `dist`-directory.

It will use the entrypoints found inside `dist/assets.json` and try to find all
dependecies of that file and group them into one larger translation file.

#### Usage

```shell
sst-scripts make-json
```

_Preferably this should run after a build script._

#### Usage in PHP

The outputted json-translation files are formatted in a way that WordPress built
in translations understand. The structure can be used by the `@wordpress/i18n`
package and sent to the client using the following:

```php
add_action('wp_enqueue_scripts', function () {
  $distPath = plugin_dir_path(__FILE__) . 'dist/';
  $distUrl = plugin_dir_url(__FILE__) . 'dist/';

  $content = file_get_contents($distPath . 'assets.json');
  $manifest = json_decode($content, true);

  foreach ($manifest as $handle => $file) {
    if (strpos($file, '.js') !== false) {
      wp_enqueue_script($handle, $distUrl . $file, ['wp-i18n'], '1.0.0', true);
      wp_set_script_translations($handle, 'domain', $distPath);
    }

    if (strpos($file, '.css') !== false) {
      wp_enqueue_style($handle, $distUrl . $file, [], '1.0.0', 'all');
    }
  }
});
```

### `sst-scripts make-aliases`

Generate parcel aliases based on the wordpress-packages that exists in your
project.

With `parcel-bundler` you can use an `alias`-prop in package.json to alias
certain packages to local files instead of searching for them in `node_modules`.
This is useful when working with `@wordpress/{package}`'s since they are
generally available under `window.wp.{package}`.

This command will look thru your dependecies and output alias files to
`src/alias/wordpress-{package}.js`. In it there will only be a singe export
pointing to `window.wp.{package}`.

And during development you can just import the scripts using standard es
modules:

```js
import { __ } from '@wordpress/i18n';
import { Button } from '@wordpress/components';
```

_Just make sure that you've also installed the package as a dependecy._

#### Usage

```shell
$ sst-scripts make-aliases
```

_Preferably this should run after new installs (e.g as postinstall script)._
