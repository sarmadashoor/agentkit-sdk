const path = require('path');

module.exports = {
  entry: './dist/index.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'bundle'),
    filename: 'agentkit-runtime-web.min.js',
    library: 'AgentKit',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  resolve: {
    extensions: ['.js']
  },
  externals: {
    // Don't bundle peer dependencies
    '@agentkit/sdk': '@agentkit/sdk'
  },
  optimization: {
    minimize: true,
    sideEffects: false
  },
  target: 'web'
};