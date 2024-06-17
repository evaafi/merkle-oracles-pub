import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

export class PullServiceClient {
  private readonly client: any;

  constructor(address) {
    var PROTO_PATH = __dirname + '/protos/client.proto';
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const pullProto = grpc.loadPackageDefinition(packageDefinition).pull_service;
    // @ts-ignore
    this.client = new pullProto.PullService(address, grpc.credentials.createSsl());
  }

  getProof(request, callback) {
    this.client.getProof(request, callback);
  }
}