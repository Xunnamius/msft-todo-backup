// TODO: replace with 'package'
import { name as pkgName } from '../package.json';
import debugFactory from 'debug';

const debugNamespace = `${pkgName}:index`;

const debug = debugFactory(debugNamespace);
