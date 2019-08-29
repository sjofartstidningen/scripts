import yargs from 'yargs';
import { makePot } from './make-pot';
import { makeJson } from './make-json';
import { makeAliases } from './make-aliases';

const noop = () => {};

yargs
  .command('make-pot', 'generate pot file', noop, makePot)
  .command('make-json', 'generate js translations', noop, makeJson)
  .command(
    'make-aliases',
    'generate parcel aliases for wordpress packages',
    noop,
    makeAliases,
  );

// eslint-disable-next-line
yargs.argv;
