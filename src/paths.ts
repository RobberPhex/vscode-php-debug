import urlRelative = require('url-relative');
import fileUrl = require('file-url');
import * as url from 'url';
import * as path from 'path';
import { decode } from 'urlencode';

/** converts a server-side Xdebug file URI to a local path for VS Code with respect to source root settings */
export function convertDebuggerPathToClient(
    fileUri: string | url.Url,
    pathMapping?: { [index: string]: string }
): string {
    let localSourceRoot: string | undefined;
    let serverSourceRoot: string | undefined;
    if (typeof fileUri === 'string') {
        fileUri = url.parse(fileUri);
    }
    // convert the file URI to a path
    let serverPath = decode(fileUri.pathname!);
    // strip the trailing slash from Windows paths (indicated by a drive letter with a colon)
    const serverIsWindows = /^\/[a-zA-Z]:\//.test(serverPath);
    if (serverIsWindows) {
        serverPath = serverPath.substr(1);
    }
    if (pathMapping) {
        for (const mappedServerPath of Object.keys(pathMapping)) {
            const mappedLocalSource = pathMapping[mappedServerPath];
            // normalize slashes for windows-to-unix
            const serverRelative = (serverIsWindows ? path.win32 : path.posix).relative(mappedServerPath, serverPath);
            if (serverRelative.indexOf('..') !== 0) {
                // If a matching mapping has previously been found, only update
                // it if the current server path is longer than the previous one
                // (longest prefix matching)
                if (!serverSourceRoot || mappedServerPath.length > serverSourceRoot.length) {
                    serverSourceRoot = mappedServerPath;
                    localSourceRoot = mappedLocalSource;
                }
            }
        }
    }
    let localPath: string;
    if (serverSourceRoot && localSourceRoot) {
        // get the part of the path that is relative to the source root
        let pathRelativeToSourceRoot = (serverIsWindows ? path.win32 : path.posix).relative(
            serverSourceRoot,
            serverPath
        );
        if (serverIsWindows) {
            pathRelativeToSourceRoot = pathRelativeToSourceRoot.replace(/\\/g, path.sep);
        }
        // resolve from the local source root
        localPath = path.resolve(localSourceRoot, pathRelativeToSourceRoot);
    } else {
        localPath = path.normalize(serverPath);
    }
    return localPath;
}

/** converts a local path from VS Code to a server-side Xdebug file URI with respect to source root settings */
export function convertClientPathToDebugger(localPath: string, pathMapping?: { [index: string]: string }): string {
    let localSourceRoot: string | undefined;
    let serverSourceRoot: string | undefined;
    // Xdebug always lowercases Windows drive letters in file URIs
    let localFileUri = fileUrl(localPath.replace(/^[A-Z]:\\/, match => match.toLowerCase()), { resolve: false });
    let serverFileUri: string;
    if (pathMapping) {
        for (const mappedServerPath of Object.keys(pathMapping)) {
            const mappedLocalSource = pathMapping[mappedServerPath];
            const localRelative = path.relative(mappedLocalSource, localPath);
            if (localRelative.indexOf('..') !== 0) {
                // If a matching mapping has previously been found, only update
                // it if the current local path is longer than the previous one
                // (longest prefix matching)
                if (!localSourceRoot || mappedLocalSource.length > localSourceRoot.length) {
                    serverSourceRoot = mappedServerPath;
                    localSourceRoot = mappedLocalSource;
                }
            }
        }
    }
    if (localSourceRoot) {
        localSourceRoot = localSourceRoot.replace(/^[A-Z]:\\/, match => match.toLowerCase());
    }
    if (serverSourceRoot) {
        serverSourceRoot = serverSourceRoot.replace(/^[A-Z]:\\/, match => match.toLowerCase());
    }
    if (serverSourceRoot && localSourceRoot) {
        let localSourceRootUrl = fileUrl(localSourceRoot, { resolve: false });
        if (!localSourceRootUrl.endsWith('/')) {
            localSourceRootUrl += '/';
        }
        let serverSourceRootUrl = fileUrl(serverSourceRoot, { resolve: false });
        if (!serverSourceRootUrl.endsWith('/')) {
            serverSourceRootUrl += '/';
        }
        // get the part of the path that is relative to the source root
        const urlRelativeToSourceRoot = urlRelative(localSourceRootUrl, localFileUri);
        // resolve from the server source root
        serverFileUri = url.resolve(serverSourceRootUrl, urlRelativeToSourceRoot);
    } else {
        serverFileUri = localFileUri;
    }
    return serverFileUri;
}

function isWindowsUri(path: string): boolean {
    return /^file:\/\/\/[a-zA-Z]:\//.test(path);
}

export function isSameUri(clientUri: string, debuggerUri: string): boolean {
    if (isWindowsUri(clientUri) || isWindowsUri(debuggerUri)) {
        // compare case-insensitive on Windows
        return debuggerUri.toLowerCase() === clientUri.toLowerCase();
    } else {
        return debuggerUri === clientUri;
    }
}
