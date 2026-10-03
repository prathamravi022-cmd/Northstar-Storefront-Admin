import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = typeof err === "object" && err !== null && "status" in err
    ? err.status
    : undefined;
  const statusCode = typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600
    ? status
    : 500;

  if (statusCode >= 500) {
    req.log.error({ err, statusCode }, "Unhandled API error");
  } else {
    req.log.warn(
      { statusCode, errorType: err instanceof Error ? err.name : "UnknownError" },
      "API request rejected",
    );
  }

  res.status(statusCode).json({
    error: statusCode < 500 && err instanceof Error ? err.message : "Internal server error",
  });
};

app.use(errorHandler);

export default app;
