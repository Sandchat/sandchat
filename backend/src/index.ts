import "reflect-metadata";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { createConnection } from "typeorm";
import { redis } from "./redis";
import { SandContext } from "./type/SandContext";
import * as express from "express";
import * as connectRedis from "connect-redis";
import * as session from "express-session";
import * as cors from "cors";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { Server } from "socket.io";
import { parse } from "cookie";

dotenv.config();

const port = process.env.ENVIORMENT === "production" ? 443 : 4000;

const SESSION_SECRET = process.env.SESSION_SECRET || "dev_session_secret";

const boostrap = async () => {
	await createConnection();

	let server: https.Server | http.Server; 

	const schema = await buildSchema({
		resolvers: [__dirname + "/modules/resolvers/*/**.ts"]
	});

	const apolloServer = new ApolloServer({
		schema,
		context: ({ req, res }: SandContext) => ({ req, res })
	});

	const app = express();

	const RedisStore = connectRedis(session);

	const sessionOptions: session.SessionOptions = {
		store: new RedisStore({
			client: redis
		}),
		name: "qid",
		secret: SESSION_SECRET,
		resave: false,
		saveUninitialized: false,

		cookie: {
			httpOnly: true,
			secure: process.env.ENVIORMENT === "production",
			maxAge: 1000 * 60 * 60 * 24 * 7 * 365 // 7 years in ms
		}
	};

	app.use(
		cors({
			credentials: true,
			origin: "http://localhost:3000"
		})
	);

	app.use(session(sessionOptions));
	app.use(express.static("C:\\Users\\evony\\OneDrive\\Desktop\\sandchat\\backend\\public"));

	app.get("*", (_req, res) => res.sendFile("C:\\Users\\evony\\OneDrive\\Desktop\\sandchat\\backend\\public\\index.html"));

	apolloServer.applyMiddleware({ app });

	if(process.env.ENVIORMENT === "production") {
		app.listen(80);
		server = https.createServer({
			key: fs.readFileSync(__dirname + "/ssl/private.key"),
			cert: fs.readFileSync(__dirname + "/ssl/certificate.crt")
		}, app).listen(port, () => console.log(`server listening in production mode on port ${port}`));
	} else {
		server = http.createServer(app).listen(port, () => console.log(`Server started in development mode on port ${port}`));
	}

	const io = new Server(server, {
    	cors: {
        	origin: "http://localhost:3000",
        	credentials: true
    	}
	});

	io.use(async (socket, next) => {
	    const sessionKey = parse(socket.request.headers.cookie as any).qid.split(".")[0];

	    const key = "sess:" + sessionKey.substr(2, sessionKey.length);

	    const data = JSON.parse(await redis.get(key) + "");

	    if(!data) return next(new Error("Unauthorized"));

	    console.log("User connected, userId: " + data.userId);

	    next();
	});

	io.on("connection", (socket) => {
    	socket.on("message", (message) => {
        	console.log(`Got message : ${message.content}`);
        	socket.broadcast.emit("message", message);
    	});
	});	
}

boostrap();