// 以文本方式打包的文件(见 wrangler.toml 的 rules)

declare module '*.txt' {
  const content: string;
  export default content;
}

declare module '*.sql' {
  const content: string;
  export default content;
}
