import { Module } from "@nestjs/common";
import { LoggerSystem } from "./logger.system";

@Module({
    providers: [LoggerSystem],
    exports: [LoggerSystem],
  })
  export class LoggerSystemModule {}