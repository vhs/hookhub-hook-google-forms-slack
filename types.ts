import http from 'node:http'
import { ParamsDictionary } from 'express-serve-static-core'
import { ParsedQs } from 'qs'

export interface Request<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs,
    LocalsObj extends Record<string, any> = Record<string, any>
> extends http.IncomingMessage,
        Express.Request {
    rawBody: string
}
