/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useZodForm — typed React Hook Form wrapper with Zod resolver.
 *
 * Wraps useForm with the Zod resolver so client-side validation
 * uses the exact same schemas as server-side (from @routeride/contracts).
 *
 * Source: https://react-hook-form.com/docs/useform
 *         https://github.com/react-hook-form/resolvers#zod
 */
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";

export type InferredFormValues<TSchema> = TSchema extends { _output: infer O }
  ? O extends FieldValues
    ? O
    : FieldValues
  : FieldValues;

export interface UseZodFormProps<
  TSchema = any,
  TValues extends FieldValues = InferredFormValues<TSchema>,
  TContext = any,
> extends Omit<UseFormProps<TValues, TContext>, "resolver"> {
  schema: TSchema;
  defaultValues?: DefaultValues<TValues>;
}

/**
 * A typed wrapper around useForm that automatically applies the Zod resolver.
 *
 * @example
 * ```tsx
 * const form = useZodForm({ schema: LoginRequestSchema });
 * ```
 */
export function useZodForm<
  TSchema = any,
  TValues extends FieldValues = InferredFormValues<TSchema>,
  TContext = any,
>({
  schema,
  ...rest
}: UseZodFormProps<TSchema, TValues, TContext>): UseFormReturn<
  TValues,
  TContext
> {
  return useForm<TValues, TContext>({
    ...rest,
    resolver: zodResolver(schema as any),
    mode: rest.mode ?? "onBlur",
  });
}
