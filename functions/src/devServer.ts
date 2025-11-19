import express from "express";
import { visabilityCheck } from "./visabilityCheck";
import "dotenv/config";
import { promptScheduler } from "./promptScheduler";

const app = express();
app.use(express.json());
app.post("/visabilityCheck", visabilityCheck);
app.get("/promptScheduler", promptScheduler);

app.listen(8081, () => {
  console.log("Server started on port 8081");
});
