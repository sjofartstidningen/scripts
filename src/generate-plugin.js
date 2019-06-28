import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import _ from 'lodash';
import inquirer from 'inquirer';
import templates from './templates';
import { getData } from './data';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

async function generatePlugin() {
  const questions = [
    {
      type: 'input',
      name: 'pluginName',
      message: 'Plugin Name',
      filter: input => _.capitalize(_.deburr(input)),
      transformer: input => _.capitalize(_.deburr(input)),
      validate: input =>
        input.length > 3
          ? true
          : 'Plugin name must be more then three characters',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description',
      default: '',
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Text Domain',
      default: ({ pluginName }) => _.kebabCase(_.deburr(pluginName)),
      filter: input => _.kebabCase(_.deburr(input)),
      transformer: input => _.toLower(_.deburr(input)).replace(' ', '-'),
    },
  ];

  const answers = await inquirer.prompt(questions);

  const data = await getData();
  data.paths.plugins = path.join(
    data.paths.projectRoot,
    'web/app/mu-plugins',
    `sst-${_.kebabCase(answers.pluginName)}`,
  );

  const folders = [{ name: 'src' }];

  const templateData = { ...answers, package: data.projectPackage };
  const files = [
    {
      name: 'package.json',
      content: templates.packageJson(templateData),
    },
    {
      name: `${_.kebabCase(answers.pluginName)}.php`,
      content: templates.plugin(templateData),
    },
    {
      name: `src/${_.kebabCase(answers.pluginName)}.js`,
      content: templates.jsEntry(templateData),
    },
    {
      name: 'index.php',
      content: templates.index(templateData),
    },
    {
      name: '.babelrc',
      content: templates.babelrc(templateData),
    },
    {
      name: '.gitignore',
      content: templates.gitignore(templateData),
    },
  ];

  try {
    await mkdir(data.paths.plugins, { recursive: true });

    await Promise.all(
      folders.map(({ name }) => {
        return mkdir(path.join(data.paths.plugins, name), { recursive: true });
      }),
    );

    await Promise.all(
      files.map(({ name, content }) => {
        return writeFile(path.join(data.paths.plugins, name), content, 'utf-8');
      }),
    );
  } catch (error) {
    console.error('Failed to create plugin');
    console.error(error);
  }
}

export { generatePlugin };
