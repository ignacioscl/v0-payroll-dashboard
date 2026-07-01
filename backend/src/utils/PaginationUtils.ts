import { ParsedQs } from 'qs'
import { Request } from 'express'

const serialize = (obj: ParsedQs) => {
  const str: string[] = []
  Object.keys(obj).forEach(p => {
    // eslint-disable-next-line no-prototype-builtins
    if (obj.hasOwnProperty(p)) {
      str.push(`${p}=${obj[p]}`)
    }
  })
  return str.join('&')
}

export const getNextPage = (request: Request, page: number, lastPage: number) => {
  const { query } = request
  if (page < lastPage) {
    delete query.page
    query.page = (page + 1).toString()
    return `${request.baseUrl}${request.url.split('?')[0]}?${serialize(query)}`
  }
  return undefined
}

export const getPreviousPage = (request: Request, page: number) => {
  const { query } = request
  if (page > 0) {
    delete query.page
    query.page = (page - 1).toString()
    return `${request.baseUrl}${request.url.split('?')[0]}?${serialize(query)}`
  }
  return undefined
}

export const loadPaginationPaths = (request: Request, page: number, lastPage: number) => {
  const nextPage = getNextPage(request, page, lastPage)
  const previousPage = getPreviousPage(request, page)
  return { nextPage, previousPage }
}
