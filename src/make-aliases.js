import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import _ from 'lodash';
import { getData } from './data';

const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);

const template = _.template(`/* eslint-disable strict */
'use strict';
module.exports = <%= moduleExport %>;
`);

async function makeAliases() {
  try {
    const { package: pkg, paths } = await getData(false);
    paths.aliases = path.join(paths.root, './src/alias');
    paths.package = path.join(paths.root, './package.json');
    paths.aliasesRelativeRoot = './src/alias';

    /**
     * Initially remove all wordpress alias files since there might be modules
     * uninstalled since last run
     */
    await removePreviousWpAliases(paths.aliases);

    /**
     * Extract the @wordpress/{module-name} modules from dependecies list
     */
    const dependencies = Object.keys(pkg.dependencies)
      .filter(dep => dep.indexOf('@wordpress') > -1)
      .map(dep => {
        const [, moduleName] = dep.split('/');
        return {
          name: dep,
          filename: `wordpress-${moduleName}.js`,
          content: template({
            moduleExport: `window.wp.${camelCaseDash(moduleName)}`,
          }),
        };
      });

    if (Object.keys(pkg.dependencies).indexOf('react') > -1) {
      dependencies.push({
        name: 'react',
        filename: 'react.js',
        content: template({ moduleExport: `window.React` }),
      });
    }

    if (Object.keys(pkg.dependencies).indexOf('lodash') > -1) {
      dependencies.push({
        name: 'lodash',
        filename: 'lodash.js',
        content: template({ moduleExport: `window.lodash` }),
      });
    }

    /**
     * Get a fresh copy of the alias array removing all references to any
     * wordpress dependency
     */
    const alias = Object.entries(pkg.alias || {}).reduce(
      (acc, [key, value]) => {
        if (key.indexOf('@wordpress') > -1) return acc;
        return { ...acc, [key]: value };
      },
      {},
    );

    /**
     * Iterate thru every wordpress dependency and write out the alias files
     */
    for (let i = 0; i < dependencies.length; i++) {
      const { name, filename, content } = dependencies[i];
      alias[name] = `${paths.aliasesRelativeRoot}/${filename}`;
      await writeFile(path.join(paths.aliases, filename), content, 'utf-8');
    }

    pkg.alias = alias;
    await writeFile(
      paths.package,
      JSON.stringify(pkg, null, 2) + '\n',
      'utf-8',
    );
  } catch (error) {
    console.error(error);
  }
}

/**
 * Remove all wordpress alias files
 *
 * @returns Promise<void>
 */
async function removePreviousWpAliases(aliasesDir) {
  const wpAliases = (await readdir(aliasesDir)).filter(
    f => f.indexOf('wordpress') > -1,
  );

  return Promise.all(wpAliases.map(f => unlink(path.join(aliasesDir, f))));
}

/**
 * CamelCase a module name removing dashes
 *
 * @param {string} str
 * @returns string
 */
function camelCaseDash(str) {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

export { makeAliases };
