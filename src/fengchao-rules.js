// 日志输出
var logHandler = logData(function(data) {
        // 如果要做日志监控，在这里输出内容
        //console.log(data);
    });

// 直接请求后端
var sendToEnd = proxyRequest({
        host: 'dynamic-host',
        port: 8000
    });

// 联调模式
exports.debug = [
    {
        path : 'main.html',
        handler: getFile('main.html')
    },
    {
        path: /^\/nirvana\/((dep)|(src))/,
        handler: proxyStatic({
            host: 'static-host',
            replace: ['nirvana/', 'nirvana-workspace/nirvana/'],
            port: 8848
        })
    },
    {
        path: 'debug/debug.js',
        handler: function(context) {
            context.content = '';
        }
    },
    // library路径
    {
        path: /^\/library/,
        handler: proxyStatic({
            host: 'static-host',
            port: 8848
        })
    },
    // 登录调转页面
    {
        path: 'login.html',
        handler: getFile('login.html')
    },
    // 如果请求是传castk，不要拦截改请求
    {
        path : 'castk=',
        handler: sendToEnd
    },
    // 利用这个请求来做个jumbo
    {
        path: '/asset/common/js/core',
        handler: getFile('jumb.js')
    },
    // 请求dep文件
    // 在服务端打印日志
    {
        path: 'log/fclogimg.gif',
        handler: logHandler
    },
    {
        path: '/',
        handler: sendToEnd
    }
];

// 开发模式
exports.dev = [
    {
        path: 'log/fclogimg.gif',
        handler: logHandler
    },
    {
        path: '/docs',
        handler: getFile('/docs')
    },
    {
        path: '/',
        handler: proxyStatic({
            host: 'localhost',
            port: 8848
        })
    }
];

// 直接请求后端
exports.backend = [
    {
        path: 'log/fclogimg.gif',
        handler: logHandler
    }, 
    {
        path: '/',
        handler: sendToEnd
    }
];