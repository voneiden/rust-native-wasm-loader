import webpack from 'webpack';
import path from 'path';
import nodeFileEval from 'node-file-eval';
import process from 'process';
import { execAsync } from 'async-child-process';
import { TextDecoder, TextEncoder } from 'text-encoding';

describe('rust-native-wasm-loader', () => {
  it('loads a simple cargo project', async () => {
    jest.setTimeout(100000);

    const options = {
      release: true,
    };

    const preRules = [{
      loader: 'wasm-loader'
    }];

    const stats = await runLoader('simple', 'simple', options, preRules);

    await expectToMatchSnapshot(stats);
  });

  it('loads a simple cargo project with warnings', async () => {
    jest.setTimeout(100000);

    const options = {
      release: true,
    };

    const preRules = [{
      loader: 'wasm-loader'
    }];

    // Run clean to ensure that the warning is generated every time
    await execAsync('cargo clean', {cwd: path.resolve(__dirname, 'fixtures', 'mywarninglib')});

    const stats = await runLoader('warning', 'warning', options, preRules);

    await expectToMatchSnapshot(stats);
  });

  it('loads a simple cargo project with errors', async () => {
    jest.setTimeout(100000);

    const options = {
      release: true,
    };

    const stats = await runLoader('error', 'error', options);

    await expectToMatchSnapshot(stats);
  });

  it('loads a simple cargo project with wasm-gc', async () => {
    jest.setTimeout(100000);

    const options = {
      release: true,
      gc: true,
    };

    const preRules = [{
      loader: 'wasm-loader'
    }];

    const stats = await runLoader('simple', 'simple-gc', options, preRules);

    await expectToMatchSnapshot(stats);
  });

  it('loads a cargo-web project', async () => {
    jest.setTimeout(100000);

    const options = {
      release: true,
      cargoWeb: true,
      name: '[name].[hash:8].wasm',
    };

    const stats = await runLoader('stdweb', 'stdweb', options);

    await expectToMatchSnapshot(stats);
  });

  it('loads a wasm-bindgen project', async () => {
    jest.setTimeout(400000);

    const options = {
      release: true,
      wasmBindgen: true,
      wasm2es6js: true,
    };

    const otherRules = [
      {
        test: /\.(js|jsx|mjs)$/,
        include: path.resolve(__dirname, 'src'),
        loader: 'babel-loader',
        options: {
          compact: true,
        },
      },
    ];

    const stats = await runLoader('wasmbindgen', 'wasmbindgen', options, [], otherRules);

    await expectToMatchSnapshot(stats);
  });
});

function removeCWD(str) {
  return str.split(`${process.cwd()}/`).join('');
}

function cleanErrorStack(error) {
  return removeCWD(error.toString()).split('\n').slice(0, 2).join('\n');
}

async function expectToMatchSnapshot(stats) {
  const errors = stats.compilation.errors.map(cleanErrorStack);
  const warnings = stats.compilation.warnings.map(cleanErrorStack);

  expect(errors).toMatchSnapshot('errors');
  expect(warnings).toMatchSnapshot('warnings');

  const assetPath = stats.compilation.assets['index.js'].existsAt;
  try {
    const module = await nodeFileEval(assetPath, {
      encoding: 'utf-8',
      context: {
        require,
        Buffer,
        TextDecoder,
        TextEncoder,
        console,
        __dirname: path.dirname(assetPath)
      }
    });
    expect(await module.run()).toMatchSnapshot('output');
  } catch (e) {
    expect(e.message.split('\n')[0]).toMatchSnapshot('failure');
  }
}

function runLoader(fixture, test, options, preRules = [], otherRules = []) {
  const config = {
    context: path.resolve(__dirname, 'fixtures'),
    entry: `./${fixture}.js`,
    target: 'node',
    output: {
      path: path.resolve(__dirname, 'outputs', test),
      filename: 'index.js'
    },
    module: {
      rules: otherRules.concat([{
        test: /\.rs$/,
        use: preRules.concat([{
          loader: path.resolve(__dirname, '../src'),
          options,
        }])
      }])
    },
    node: {
      __dirname: false,
    }
  };

  const compiler = webpack(config);

  return new Promise((resolve, reject) => compiler.run((err, stats) => {
    if (err) {
      reject(err);
    } else {
      resolve(stats);
    }
  }))
}
