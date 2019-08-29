import path from 'path';
import os from 'os';
import readPkg from 'read-pkg-up';
import execa from 'execa';

async function getData(normalizePackage = true) {
  const pkg = await readPkg({ normalize: normalizePackage });
  const rootDir = path.dirname(pkg.path);

  return {
    package: pkg.package,
    paths: {
      root: rootDir,
      src: path.join(rootDir, 'src'),
      dist: path.join(rootDir, 'dist'),
      languages: path.join(rootDir, 'languages'),
      views: path.join(rootDir, 'views'),
      temp: os.tmpdir(),
    },
  };
}

export { getData };
