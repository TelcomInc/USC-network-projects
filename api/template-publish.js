import {onRequest} from "../functions/api/template-publish.js";
import {wrap} from "./_runtime.js";
export const config = {api:{bodyParser:{sizeLimit:"10mb"}}};
export default wrap(onRequest);
