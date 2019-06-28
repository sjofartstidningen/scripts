/**
 * The wp-cli has a built in command to generate .pot-files and extract
 * translation strings from php- and javascript-files.
 * But it lacks support for modern js and when it meets someting out of the
 * ordinary, e.g. a dynamic import it will bail on that file and continue its
 * work on the next file.
 *
 * This script exposes a work around where dynamic imports will be removed
 * before running `wp i18n make-pot`.
 * After completion the original files are restored.
 */
import path from 'path';
import fs from 'fs-extra';
import replace from 'replace-in-file';
import execa from 'execa';
import { getData } from './data';

async function makePot() {
  const { package: pkg, paths } = await getData(false);
  const tmpSrc = path.join(paths.temp, 'src');

  try {
    // We back up the original source files inside a temporary directory
    await fs.copy(paths.src, tmpSrc);

    // All `import()` calls will just be commented out
    await replace({
      files: path.join(paths.src, '**/*.js'),
      from: /.+import\(.+\);?/g,
      to: match => `// ${match}`,
    });

    // When replacemnets are done wp-cli can do it's work
    await execa('wp', [
      'i18n',
      'make-pot',
      '.',
      path.join(paths.dist, `${pkg.name.replace(/^(@\w+\/)/, '')}.pot`),
      '--exclude=dist',
    ]);
  } catch (error) {
    console.error('An error occured while generating a .pot-file');
    console.error(error);
  } finally {
    /**
     * We use the finally block to make sure that orginal files are always
     * copied back to its source, event if an error occurs.
     *
     * We catch any errors from these calls since they're not important and will
     * most likely mean that we didn't even reach a point where we backed up the
     * src directory.
     */
    await fs.copy(tmpSrc, paths.src).catch(() => {});
    await fs.remove(tmpSrc).catch(() => {});
  }
}

export { makePot };
