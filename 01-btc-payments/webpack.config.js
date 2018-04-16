const clientConfig = {
  devtool: "inline-source-map",
  entry: {
    client: "./client/index.ts",
  },
  mode: "development",
  output: {
    path: __dirname + "/build",
    filename: "[name].js"
  },
  resolve: {
    extensions: [".ts", ".js" ]
  },
  module: {
    rules: [
      { 
        test: /\.ts$/,
        loader: "ts-loader"
      }
    ]
  },
  target: "web"
}

module.exports = [ clientConfig ];
