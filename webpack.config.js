import url from "url";

export default {
    entry: './src/index.mjs',
    output: {
        path: url.fileURLToPath(new URL('dist/js', import.meta.url)),
        filename: 'app.js'
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
