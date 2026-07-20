export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export type IsEmptyObject<T> = T extends object
    ? keyof T extends never
        ? true
        : false
    : false;

type OptionalKeys<T> = {
    [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

export type IfAllPropertiesOptional<T, TIf, TElse> = T extends Record<string, unknown>
    ? Exclude<keyof T, OptionalKeys<T>> extends never
        ? TIf
        : TElse
    : TElse;

type ExcludeKeysWithTypeOf<T, V> = {
    [K in keyof T]-?: [Exclude<T[K], undefined>] extends [V] ? never : K;
}[keyof T];

type ExcludeKeysWithoutTypeOf<T, V> = {
    [K in keyof T]-?: [Exclude<T[K], undefined>] extends [V] ? K : never;
}[keyof T];

export type With<T, V> = Pick<T, ExcludeKeysWithoutTypeOf<T, V>>;
export type Without<T, V> = Pick<T, ExcludeKeysWithTypeOf<T, V>>;
