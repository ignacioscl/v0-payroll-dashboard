import { Injectable, Scope, ConsoleLogger, LoggerService } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerSystem extends ConsoleLogger implements LoggerService {
    log(message: any, ...optionalParams: any[]) {
        // Custom logic
        super.log(message, ...optionalParams);
      }
    
      fatal(message: any, ...optionalParams: any[]) {
        // Custom logic
        super.error('Fatal:', message, ...optionalParams);
      }
    
      error(message: any, ...optionalParams: [...any, string?, string?]) {
        if (optionalParams[0] instanceof Error) {
            const [error, context] = optionalParams;
            super.error(message, error.stack, context);
          } else {
            super.error(message, ...optionalParams);
          }
      }
    
      warn(message: any, ...optionalParams: any[]) {
        // Custom logic
        super.warn(message, ...optionalParams);
      }


      debug(message: any, ...optionalParams: [...any, string?]) {
        super.debug(message,optionalParams)
      }
  
}