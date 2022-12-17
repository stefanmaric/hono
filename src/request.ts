import { parseBody } from './utils/body'
import type { BodyData } from './utils/body'
import type { Cookie } from './utils/cookie'
import { parse } from './utils/cookie'
import { getQueryStringFromURL } from './utils/url'

export interface HonoRequest<ParamKeyType extends string = string, Data = unknown>
  extends Request,
    HonoExtensions<ParamKeyType, Data> {
      clone(): HonoRequest
    }

export class HonoRequest<ParamKeyType extends string = string, Data = unknown> {
  constructor(input: RequestInfo | URL | HonoRequest<ParamKeyType, Data>, init?: RequestInit) {
    if (input instanceof HonoRequest) return input

    const req = input instanceof Request ? input : new Request(input, init)

    return new Proxy(new HonoExtensions<ParamKeyType, Data>(req), {
      getPrototypeOf() {
        // The target in reality is a HonoExtension, but that's a private API. We want everything
        // to the treated as HonoRequest.
        return HonoRequest.prototype
      },
      get(target, prop) {
        if (prop in target) return (target as any)[prop]
        return Reflect.get(req, prop, req)
      },
    }) as HonoExtensions<ParamKeyType, Data> & Request
  }
}

class HonoExtensions<ParamKeyType extends string = string, Data = unknown> {
  // Ideally, this should be private, but Proxies don't work with private properties.
  // See: https://github.com/tc39/proposal-class-fields/issues/106
  req: Request

  constructor(req: Request) {
    this.req = req
  }

  paramData?: Record<ParamKeyType, string>
  param(key: ParamKeyType): string
  param(): Record<ParamKeyType, string>
  param(key?: ParamKeyType) {
    if (this.paramData) {
      if (key) {
        const param = this.paramData[key]
        return param ? decodeURIComponent(param) : undefined
      } else {
        const decoded: Record<string, string> = {}

        for (const [key, value] of Object.entries(this.paramData)) {
          if (typeof value === 'string') {
            decoded[key] = decodeURIComponent(value)
          }
        }

        return decoded
      }
    }
    return null
  }

  headerData?: Record<string, string>
  header(name: string): string
  header(): Record<string, string>
  header(name?: string) {
    if (!this.headerData) {
      this.headerData = {}
      this.req.headers.forEach((value, key) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.headerData![key] = value
      })
    }
    if (name) {
      return this.headerData[name.toLowerCase()]
    } else {
      return this.headerData
    }
  }

  queryData?: Record<string, string>
  query(key: string): string
  query(): Record<string, string>
  query(key?: string) {
    const queryString = getQueryStringFromURL(this.req.url)
    const searchParams = new URLSearchParams(queryString)
    if (!this.queryData) {
      this.queryData = {}
      for (const key of searchParams.keys()) {
        this.queryData[key] = searchParams.get(key) || ''
      }
    }
    if (key) {
      return this.queryData[key]
    } else {
      return this.queryData
    }
  }

  queries(key: string): string[]
  queries(): Record<string, string[]>
  queries(key?: string) {
    const queryString = getQueryStringFromURL(this.req.url)
    const searchParams = new URLSearchParams(queryString)
    if (key) {
      return searchParams.getAll(key)
    } else {
      const result: Record<string, string[]> = {}
      for (const key of searchParams.keys()) {
        result[key] = searchParams.getAll(key)
      }
      return result
    }
  }

  cookie(): Cookie
  cookie(key: string): string | undefined
  cookie(key?: string) {
    const cookie = this.req.headers.get('Cookie') || ''
    const obj = parse(cookie)

    if (key) {
      const value = obj[key]
      return value || undefined
    }

    return obj
  }

  bodyData?: BodyData
  async parseBody<BodyType extends BodyData>(): Promise<BodyType> {
    // Cache the parsed body
    let body: BodyType
    if (!this.bodyData) {
      body = await parseBody<BodyType>(this.req)
      this.bodyData = body
    } else {
      body = this.bodyData as BodyType
    }
    return body
  }

  jsonData?: any
  async json() {
    // Cache the JSON body
    let jsonData: any
    if (!this.jsonData) {
      jsonData = JSON.parse(await this.req.text())
      this.jsonData = jsonData
    } else {
      jsonData = this.jsonData
    }
    return jsonData
  }

  data?: Data
  valid(data?: unknown): Data {
    if (!this.data) {
      this.data = {} as Data
    }
    if (data) {
      this.data = data as Data
    }
    return this.data
  }

  clone() {
    return new HonoRequest(this.req.clone())
  }
}
