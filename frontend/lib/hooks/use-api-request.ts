import '@/lib/api/axios-defaults';
import axios, { AxiosRequestConfig } from 'axios';
import qs from 'qs';
import { useState } from 'react';
import { PaginationDto } from '@/types/pagination-dto';
import urlFetch from '@/types/get-url';
import CustomError from '@/types/custom-error';
import { UrlEnum } from '@/types/enum-url';

export type PaginationState = {
  pageIndex?: number | undefined;
  pageSize?: number;
};

interface UseApiRequest<T, Q, R> {
  getRaw: () => Promise<R>;
  getAll: (pagination?: PaginationState, query?: Q) => Promise<PaginationDto<T>>;
  getCustom: (path: string, pagination?: PaginationState, query?: Q) => Promise<PaginationDto<T>>;
  getOne: (id: number) => Promise<R>;
  downloadFile: (id: number | string) => Promise<Blob>;
  downloadFileCustom: (customUrl?: string, body?: Record<string, any>) => Promise<Blob>;
  getOneCustom: (queryString: Q) => Promise<T>;
  post: (payload: T) => Promise<R>;
  update: (id: number, payload: T) => Promise<void>;
  updateCustom: (queryString: Q | string, payload: T) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  deleteCustom: (queryString: string | Q) => Promise<void>;
  error: any;
  errorDetail: ApiError | undefined;
  pagination: PaginationState;
  setPagination: (a: any) => void;
}

interface ApiError {
  message: string;
  status: number;
  validationErrors: string | [];
  i18nKey?: string;
  replacements?: string[];
}

interface GetOneOptions {
  responseType?: 'blob' | 'json';
  headers?: Record<string, string>;
}

export function useApiRequest<T, Q = undefined, R = T>(
  urlEnum?: UrlEnum,
  iUrl?: string
): UseApiRequest<T, Q, R> {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  let url = iUrl || '';
  if (urlEnum) {
    const { getUrl } = urlFetch(urlEnum);
    url = getUrl();
  }

  const [error, setError] = useState();
  const [errorDetail, setErrorDetail] = useState<ApiError>();

  const getRaw = async (): Promise<R> => {
    try {
      const { data } = await axios.get(url);
      return data;
    } catch (error: any) {
      setError(error);
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const getAll = async (pagination?: PaginationState, query?: Q): Promise<PaginationDto<T>> => {
    let queryParams = {
      page: pagination?.pageIndex ?? 0,
      pageSize: pagination?.pageSize ?? 10,
      ...query,
    };
    // if (query && hasQueryChanged(query)) {
    //   setPagination({ pageIndex: 0, pageSize: 10 });
    //   queryParams = {
    //     page: 0,
    //     pageSize: 10,
    //     ...query,
    //   };
    // }
    /* if (query && hasQueryChanged(query)) {
      setPagination({
        pageIndex: pagination?.pageIndex ? pagination?.pageIndex - 1 : 0,
        pageSize: pagination?.pageSize ?? 10,
      });
      queryParams = {
        page: pagination?.pageIndex ? pagination?.pageIndex - 1 : 0,
        pageSize: pagination?.pageSize ?? 10,
        ...query,
      };
    }*/

    const queryString = qs.stringify(queryParams, { addQueryPrefix: true });
    try {
      const { data } = await axios.get(`${url}${queryString}`);
      return data;
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      //return {data: [],...pagination,total:0,error:error?.response?.data} as any
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };
  const getCustom = async (
    path: string,
    pagination?: PaginationState,
    query?: Q
  ): Promise<PaginationDto<T>> => {
    const queryParams = {
      page: pagination?.pageIndex,
      pageSize: pagination?.pageSize,
      ...query,
    };

    const queryString = qs.stringify(queryParams, { addQueryPrefix: true });
    try {
      const { data } = await axios.get(`${url}${path}${queryString}`);
      return data;
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      //return {data: [],...pagination,total:0,error:error?.response?.data} as any
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };
  const getOne = async (id: number): Promise<R> => {
    try {
      const { data } = await axios.get(`${url}/${id}`);
      return data;
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      //return {data: [],...pagination,total:0,error:error?.response?.data} as any
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const getOneCustom = async (queryString: Q): Promise<T> => {
    try {
      const queryStringFormatted = qs.stringify(queryString, { addQueryPrefix: true });
      const { data } = await axios.get(`${url}/${queryStringFormatted}`);
      return data;
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      //return {data: [],...pagination,total:0,error:error?.response?.data} as any
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const downloadFile = async (id: number | string): Promise<Blob> => {
    try {
      const { data } = await axios.get(`${url}/${id}`, {
        responseType: 'blob',
      });
      return data;
    } catch (error: any) {
      setError(error);
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const downloadFileCustom = async (
    customUrl?: string,
    queryParams?: Record<string, any>
  ): Promise<Blob> => {
    try {
      const { data } = await axios.get(customUrl || url, {
        responseType: 'blob',
        ...(queryParams && { params: queryParams }),
      });
      return data;
    } catch (error: any) {
      setError(error);
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const post = async (payload: T): Promise<R> => {
    try {
      const { data } = await axios.post(`${url}`, payload);
      return data;
    } catch (error: any) {
      console.log('error pasa', error.status);
      if ((error.response && error.response.status === 401) || error.status === 401) {
        console.log('401');
        throw error;
      }
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });

      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const update = async (id: number, payload: T): Promise<void> => {
    try {
      await axios.put(`${url}/${id}`, payload);
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const updateCustom = async (queryParams: Q | string, payload: T): Promise<void> => {
    let queryString;
    if (typeof queryParams === 'object') {
      queryString = qs.stringify(queryParams, { addQueryPrefix: true });
    } else {
      queryString = queryParams;
    }

    try {
      await axios.put(`${url}${queryString}`, payload);
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const deleteItem = async (id: number): Promise<void> => {
    try {
      await axios.delete(`${url}/${id}`);
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  const deleteCustom = async (queryParams: string | Q): Promise<void> => {
    let queryString;
    if (typeof queryParams === 'object') {
      queryString = qs.stringify(queryParams, { addQueryPrefix: true });
    } else {
      queryString = queryParams;
    }

    try {
      await axios.delete(`${url}${queryString}`);
    } catch (error: any) {
      setError(error); // Lanza el error para que el llamador pueda manejarlo si es necesario
      setErrorDetail({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
      throw new CustomError({
        message: error?.response?.data?.message,
        status: error?.response?.status,
        validationErrors: error?.response?.data?.validationErrors,
        i18nKey: error?.response?.data.i18nKey,
        replacements: error?.response?.data.replacements,
      });
    }
  };

  return {
    getRaw,
    getAll,
    getOne,
    downloadFile,
    downloadFileCustom,
    getOneCustom,
    post,
    update,
    updateCustom,
    deleteItem,
    deleteCustom,
    getCustom,
    error,
    errorDetail,
    setPagination,
    pagination,
  };
}
