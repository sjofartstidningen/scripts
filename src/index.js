import yargs from 'yargs';
import { makePot } from './make-pot';
import { makeJson } from './make-json';
import { makeAliases } from './make-aliases';
import { generatePlugin } from './generate-plugin';

const noop = () => {};

yargs
  .command('make-pot', 'generate pot file', noop, makePot)
  .command('make-json', 'generate js translations', noop, makeJson)
  .command(
    'make-aliases',
    'generate parcel aliases for wordpress packages',
    noop,
    makeAliases,
  )
  .command('generate-plugin', 'generate a new mu-plugin', noop, generatePlugin);

// eslint-disable-next-line
yargs.argv;
