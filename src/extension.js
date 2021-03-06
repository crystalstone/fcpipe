var httpProxy = require('http-proxy');
var proxy = new httpProxy.RoutingProxy();
var _SESSION = {};

exports.defaultHost = 'fc-offline.baidu.com';

exports.proxyTo = function (request, response, config) {
    if (config.qhost) {
        request.headers.host = config.qhost;
    } else {
        request.headers.host = 'fc-offline.baidu.com:8000';
    }

    proxy.proxyRequest(request, response, config);
};

/**
 * ajax请求匹配转发规则
 * @param  {url} url  请求上下问
 * @param  {Object} rules 转发规则
 */
exports.ajaxHandler = function (url, rules) {
    var mt = url.match(/path=([\w|\/]+)/);

    if (mt && mt.length == 2 && mt[1] in rules) {
        return rules[mt[1]];
    }
    return false;
};

exports.getSession = function(request) {
    var costr = request.headers.cookie;
    var cookie = {};
    if (costr) {
        costr.split(';').forEach(function( item ) {
            var parts = item.split('=');
            cookie[ parts[ 0 ].trim() ] = ( parts[ 1 ] || '' ).trim();
        });
    }

    var _id =  cookie['BAIDUID'];

    if (_id) {
        if (!_SESSION[_id]) {
            _SESSION[_id] = {
                login: false,
                count: 0
            };
        }

        _SESSION[_id].cookie = cookie;
        return _SESSION[_id];
    }
    return null;
};

/**
 * 代理静态资源
 * @param  {object} option 代理配置
 *    replace: [source, target] 对url进行替换
 *    host: 请求域名/ip; 如果是router指定的解析；采用router中的ip替换
 *    port: 代理端口
 */
exports.proxyStatic = function(option) {

    /**
     * 代理处理函数
     * @param  {Object} context 请求上下文
     * @param  {Object} router  指定路由表
     * @return {boolean} {true: 表示resonse转移或关闭}
     */
    return function(context, router) {
        var request = context.request;
        var response = context.response;

        // url替换规则
        if (option.replace) {
            request.url = request.url.replace(
                option.replace[0], option.replace[1]);
        }

        if (option.host in router) {
            option.host = router[option.host];
        }

        if (option.port && option.host) {
            var config = {
                host: option.host,
                port: option.port
            };

            proxy.proxyRequest(request, response, config);
            return true;
        }
    };
};

/**
 * 代理服务端资源或请求
 * @param  {object} option 代理配置
 *    replace: [source, target] 对url进行替换
 *    host: 请求域名/ip; 
 *        如果是router指定的解析；采用router中的ip替换
 *    port: 代理端口
 */
exports.proxyRequest = function(option) {
    return function(context, router) {
        var request = context.request;
        var response = context.response;
        var headers = request.headers;
        var rqhost = headers.host && headers.host.replace(/:\d+/, '');

        // 如果请求domain不在列表中，强制转为最后一种
        if (!(rqhost in router)) {
            rqhost = exports.defaultHost;
        }

        // url替换规则
        if (option.replace) {
            request.url = request.url.replace(
                option.replace[0], option.replace[1]);
        }

        // 如果是远程host修改为请求host
        if (option.host == 'dynamic-host') {
            var headers = request.headers;
            headers.host = rqhost + ':' + option.port;
            option.host = rqhost;
        }

        if (option.host in router) {
            option.host = router[option.host];
        }
        
        if (option && option.host) {
            var config = {
                host: option.host,
                port: option.port || process.port
            };

            // 再这里拦截ajax请求
            if (option.ajaxRules && request.url.match(/request.ajax/)) {
                var _config = exports.ajaxHandler(request.url, option.ajaxRules);

                // 如果返回的是代理参数，改写代理参数
                if (_config && _config.host) {
                    config = _config;
                } else if (_config) {
                    response.end(JSON.stringify(_config));
                    return true;
                }
            }

            try {
                proxy.proxyRequest(request, response, config);
            } catch (ex) {
                console.log('Error:' , request.url);
                response.end('error');
            }
            return true;
        }
    };
};

/**
 * 代理静态资源
 * @param  {String} targetURL 目标url
 * @param {boolean} backend 是否服务端跳转
 */
exports.redirect = function(targetURL, backend) {
    return function(context, config) {
        var response = context.response;
        var request = context.request;

        // 服务端代理
        if (backend) {
            var query = require('url').parse(targetURL);
            var config = {
                host: query.hostname,
                port: query.port || 80
            };
            request.url = query.path;
            proxy.proxyRequest(request, response, config);
            return true;
        }
        response.writeHead(302, {
            Location: targetURL
        });
        response.end('');
        return true;
    };
};

/**
 * 输出json内容
 * @param  {Object} data 输出对象
 */
exports.printJSON = function(data) {
    return function(context) {
        var response = context.response;
        response.write(JSON.stringify(data, '\t', 3));
    };
};

/**
 * 从本地换取文件 (支持目录代理- 根据url解析文件名)
 * - 如果文件不存在，会请求src/files下的默认文件
 * @param  {string} filePath 文件路径
 */
exports.getFile = function(filePath, cwd) {
    var fs = require('fs');
    return function(context) {
        var response = context.response;
        var request = context.request;
        var fs = require( 'fs' );
        var path = require( 'path' );
        cwd = cwd || process.cwd();

        if (filePath) {
            var existed = fs.existsSync(filePath);
            var fp = filePath;

            if (!existed) {
                fp = path.resolve(cwd, filePath);
                existed = fs.existsSync(fp);
            }

            if (existed && fs.statSync(fp).isDirectory()) {
                var query = require('url').parse(request.url);
                if (query.pathname) {
                    _getFile(context, query.pathname, fp);
                } else {
                    response.write(filePath + 'is directory');
                }

            } else if (existed) {
                var bf = fs.readFileSync(fp);
                response.write(bf);
                return;
            } else {
                var pwd = path.resolve(__dirname, 'files');
                var fp = path.join(pwd, filePath);
                var existed = fs.existsSync(fp);

                if (existed && fs.statSync(fp).isDirectory()) {
                    _getFile(context, fp);
                } else if (existed) {
                    var bf = fs.readFileSync(fp);
                    response.write(bf);
                } else {
                    var msg = {
                        status: 404,
                        pwd: pwd,
                        cwd: cwd,
                        url: context.request.url,
                        file: fp
                    };

                    response.write(JSON.stringify(msg));
                }
            }
        }
        response.end('');
    };
};

// getFile 的辅助函数，为了读取目录
function _getFile(context, filePath, cwd) {
    var _func = exports.getFile(filePath, cwd);
    _func(context);
}

exports.mockJSON = function(template, pkgData) {
    var mock = require('mockjson');
    return function(context) {
        mock.context = context;
        var data = mock.generate(template);
        context.content = JSON.stringify(data, '\t', 3);
    };
};

exports.logData = function(callback) {
    return function(context) {
        var response = context.response;
        var request = context.request;
        
        if (request.method == 'POST') {
            var buffer = [];
            request.on('data', function(chunk) {
                buffer.push(chunk);
                
            });

            request.on('end', function(chunk) {
                buffer.push(chunk);
                var str = buffer.join('').toString();
                callback && callback(str);
                response.write(str);
            });
        }

        response.end();
        return true;
    };
};