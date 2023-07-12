import url from "url";

export default {
    entry: './src/index.mjs',
    experiments: {
        outputModule: true,
    },
    output: {
        path: url.fileURLToPath(new URL('dist/js', import.meta.url)),
        filename: 'app.js',
        module: true,
    },
    module: {
        rules: [
            {
                test: /\.m?js$/,
                resolve: {
                    fullySpecified: false,
                },
            },
            {
                test: /\.css$/,
                use: [ 'style-loader', 'css-loader' ]
            }
        ]
    }
};
