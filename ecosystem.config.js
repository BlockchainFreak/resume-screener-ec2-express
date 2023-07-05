module.exports = {
    apps: [{
        name: 'my-app',
        script: './src/index.ts',
        interpreter: 'ts-node',
        watch: true,
        env: {
            NODE_ENV: 'development',
        },
        env_production: {
            NODE_ENV: 'production',
        },
    }],
};