const path = require('path');

module.exports = {
  entry: './src/index.tsx',
  output: {
    filename: 'extension-logs.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'window',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules\/(?!@argoplane)/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
};
