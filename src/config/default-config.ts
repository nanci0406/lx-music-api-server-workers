// 默认配置，对应 Python 版的 config.yml。
// Workers 版的配置保存在 D1 里，读取时与这里的默认值深度合并，缺少的项自动使用默认值。
// 和 Python 版相比去掉了不适用于 Workers 的项：监听地址/端口、HTTPS 证书、反向代理、出站代理、本地音乐。

export const DEFAULT_CONFIG = {
  common: {
    debug_mode: false, // 是否输出调试日志
    log_length_limit: 500, // 单条日志长度限制
    parse_log_retention_days: 30, // 解析记录保留天数，超期记录每天自动清理，0 表示不清理
    timezone: 8, // 统计按天分组、日志时间使用的时区(UTC 偏移小时数)，中国大陆为 8
    // 请求音乐平台时附带的 X-Forwarded-For。Workers 从海外节点发出请求，部分平台需要国内 IP 才能正常返回，留空则不附带。
    // 需要是平台认可的国内地址：酷狗不认 1.0.1.114(Python 版的默认值)，会要求“本次请求需要验证”(20028)
    fakeip: '116.25.146.177',
    cookiepool: false, // 是否启用账号池(cookie 池)，启用后各平台从 module.cookiepool 中随机选择账号，单账号配置会被忽略
    allow_download_script: true, // 是否允许通过 /script?key=你的key 下载音源脚本
    download_config: { // 音源脚本的相关配置
      name: '修改为你的源脚本名称',
      intro: '修改为你的源脚本描述',
      author: '修改为你的源脚本作者',
      version: '修改为你的源版本',
      filename: 'lx-music-source.js', // 客户端保存脚本时的文件名
      dev: false, // 是否启用开发模式(LX Music 会打开开发者工具)
      update: true, // 是否开启脚本更新提醒
      // 可用参数：{updateUrl} 更新地址(带 key)，{url} 请求地址(不带参数)，{key} 请求时的 key
      updateMsg: '源脚本有更新啦，更新地址:\\n{updateUrl}',
      quality: {
        kg: ['128k'],
        tx: ['128k'],
        wy: ['128k'],
      },
    },
  },

  security: {
    rate_limit: {
      global: 0, // 全局两次解析请求的最小间隔(秒)，0 为不限制
      ip: 0, // 单个 IP 两次解析请求的最小间隔(秒)
    },
    key: {
      enable: true, // 解析接口是否需要用户名和 Key
    },
    admin_origin_check: true, // 校验后台写请求的 Origin/Referer 必须与访问的 Host 一致(防 CSRF)
    allowed_host: {
      enable: false, // 只允许通过指定的域名访问
      blacklist: {
        enable: false, // Host 不匹配时封禁来源 IP
        length: 0, // 封禁时长(秒)，0 为永久
      },
      list: ['localhost', '127.0.0.1'],
    },
    banlist: {
      enable: true,
      expire: {
        enable: true,
        length: 604800,
      },
    },
  },

  module: {
    kg: { // 酷狗音乐
      enable: true,
      client: { // 客户端请求配置，不懂请保持默认，修改请统一为字符串格式
        appid: '1005', // 官方安卓为 1005，官方 PC 为 1001，概念版为 3116
        signatureKey: 'OIlwieks28dk2k092lksi2UIkp', // 签名用的 key，需要与 appid 对应
        clientver: '12029',
        pidversionsecret: '57ae12eb6890223e355ccfcb74edf70d',
        pid: '2',
      },
      tracker: { // tracker 接口配置，不懂请保持默认
        host: 'https://gateway.kugou.com',
        path: '/v5/url',
        version: 'v5',
        'x-router': { // host 为 gateway.kugou.com 时需要追加此头
          enable: true,
          value: 'tracker.kugou.com',
        },
        extra_params: {} as Record<string, unknown>, // 自定义追加的请求参数
      },
      user: { // 抓包 /v5/url 请求获得；需要 VIP 账号才能获取会员歌曲，mid 必填(可以随便填一串数字)
        token: '',
        userid: '0',
        mid: '114514',
        lite_sign_in: { // 概念版自动签到，仅在 appid 为 3116 时运行
          enable: false,
          interval: 86400,
          mixsongmid: {
            value: 'auto', // mixsongmid 的获取方式，默认 auto，也可以填一个数字
          },
        },
        refresh_login: { // token 保活，30 天不刷新会失效；appid 为 3116 时需要同时更换 signatureKey
          enable: false,
          interval: 86000,
          login_url: 'http://login.user.kugou.com/v4/login_by_token',
        },
      },
    },

    tx: { // QQ 音乐
      enable: true,
      vkeyserver: { // 请求官方接口时使用的 guid、uin，不需要与账号一致
        guid: '114514',
        uin: '10086',
      },
      user: { // 推荐在后台“音乐账号”页扫码登录，会自动填写；qqmusic_key 也可以从 Cookie 或客户端请求体(comm.authst)获取
        qqmusic_key: '',
        uin: '',
        // 刷新登录所需的凭证，来自登录接口(music.login.LoginServer)的返回，刷新成功后会自动更新
        refresh_key: '',
        refresh_token: '',
        openid: '',
        access_token: '',
        unionid: '',
        login_type: '', // 1 微信，2 QQ；留空时按 qqmusic_key 的前缀判断
        refresh_login: {
          enable: false,
          interval: 86000,
        },
      },
      cdnaddr: 'http://ws.stream.qqmusic.qq.com/',
      vkey_api: { // 第三方 vkey 获取接口
        use_vkey_api: false,
        vkey_api_url: 'xxx',
      },
    },

    wy: { // 网易云音乐
      enable: true,
      user: {
        cookie: '', // 完整 Cookie，需包含 MUSIC_U
        refresh_login: {
          enable: false,
          interval: 86400,
        },
      },
    },

    gcsp: { // 歌词适配后端，请只在私人范围内使用
      enable: false,
      path: '/client/cgi-bin/api.fcg',
      enable_verify: false,
      package_md5: '',
      salt_1: 'NDRjZGIzNzliNzEe',
      salt_2: '6562653262383463363633646364306534333668',
    },

    cookiepool: { // 账号池，格式与各平台的 user 相同；每个账号可以单独设置 refresh_login
      kg: [
        {
          userid: '0',
          token: '',
          mid: '114514',
          lite_sign_in: { enable: false, interval: 86400, mixsongmid: { value: 'auto' } },
          refresh_login: { enable: false, interval: 86000, login_url: 'http://login.user.kugou.com/v4/login_by_token' },
        },
      ] as Record<string, any>[],
      tx: [
        {
          qqmusic_key: '',
          uin: '',
          refresh_key: '',
          refresh_token: '',
          openid: '',
          access_token: '',
          unionid: '',
          login_type: '',
          refresh_login: { enable: false, interval: 86000 },
        },
      ] as Record<string, any>[],
      wy: [
        {
          cookie: '',
          refresh_login: { enable: false, interval: 86400 },
        },
      ] as Record<string, any>[],
    },
  },
};
