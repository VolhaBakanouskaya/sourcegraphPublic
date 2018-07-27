#!/bin/bash
# This runs a published server image.

DATA=/tmp/sourcegraph

case $CLEAN in

    "true")
        clean=y
        ;;
    "false")
        clean=n
        ;;
    *)
        echo -n "Do you want to delete $DATA and start clean? [Y/n] "
        read clean
        ;;
esac

if [ "$clean" != "n" ] && [ "$clean" != "N" ]; then
    echo "deleting $DATA"
    rm -rf $DATA
fi

IMAGE=${IMAGE:-sourcegraph/server:insiders}
echo "pulling docker image ${IMAGE}"
docker pull $IMAGE

echo "starting server..."
docker run "$@" \
 --publish 7080:7080 --rm \
 -e SRC_LOG_LEVEL=dbug \
 --volume $DATA/config:/etc/sourcegraph \
 --volume $DATA/data:/var/opt/sourcegraph \
 -v /var/run/docker.sock:/var/run/docker.sock \
 $IMAGE
