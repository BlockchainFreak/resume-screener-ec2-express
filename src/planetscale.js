const { connect } = require("@planetscale/database");

// create the connection
export const connection = connect({
    host: process.env["DATABASE_HOST"],
    username: process.env["DATABASE_USERNAME"],
    password: process.env["DATABASE_PASSWORD"],
});