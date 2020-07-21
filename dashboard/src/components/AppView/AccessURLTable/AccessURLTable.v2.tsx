import { get } from "lodash";
import React, { useEffect } from "react";

import Table from "components/js/Table";
import Tooltip from "components/js/Tooltip";
import ResourceRef from "shared/ResourceRef";
import LoadingWrapper from "../../../components/LoadingWrapper/LoadingWrapper.v2";
import { IK8sList, IKubeItem, IResource, IServiceSpec } from "../../../shared/types";
import isSomeResourceLoading from "../helpers";
import { GetURLItemFromIngress } from "./AccessURLItem/AccessURLIngressHelper";
import { GetURLItemFromService } from "./AccessURLItem/AccessURLServiceHelper";

interface IAccessURLTableProps {
  services: Array<IKubeItem<IResource | IK8sList<IResource, {}>>>;
  ingresses: Array<IKubeItem<IResource | IK8sList<IResource, {}>>>;
  ingressRefs: ResourceRef[];
  getResource: (r: ResourceRef) => void;
}

function elemHasItems(i: IKubeItem<IResource | IK8sList<IResource, {}>>) {
  if (i.error) {
    return true;
  }
  if (i.item) {
    const list = i.item as IK8sList<IResource, {}>;
    if (list.items && list.items.length === 0) {
      return false;
    }
    return true;
  }
  return false;
}

function hasItems(
  svcs: Array<IKubeItem<IResource | IK8sList<IResource, {}>>>,
  ingresses: Array<IKubeItem<IResource | IK8sList<IResource, {}>>>,
) {
  return (
    (svcs.length && svcs.some(svc => elemHasItems(svc))) ||
    (ingresses.length && ingresses.some(ingress => elemHasItems(ingress)))
  );
}

function filterPublicServices(services: Array<IKubeItem<IResource | IK8sList<IResource, {}>>>) {
  const result: Array<IKubeItem<IResource>> = [];
  services.forEach(s => {
    if (s.item) {
      const listItem = s.item as IK8sList<IResource, {}>;
      if (listItem.items) {
        listItem.items.forEach(item => {
          if (item.spec.type === "LoadBalancer") {
            result.push({ isFetching: false, item });
          }
        });
      } else {
        const spec = (s.item as IResource).spec as IServiceSpec;
        if (spec.type === "LoadBalancer") {
          result.push(s as IKubeItem<IResource>);
        }
      }
    }
  });
  return result;
}

function flattenIngresses(ingresses: Array<IKubeItem<IResource | IK8sList<IResource, {}>>>) {
  const result: Array<IKubeItem<IResource>> = [];
  ingresses.forEach(ingress => {
    const list = ingress.item as IK8sList<IResource, {}>;
    if (list && list.items) {
      list.items.forEach(i => {
        result.push({ isFetching: false, item: i, error: ingress.error });
      });
    } else {
      result.push(ingress as IKubeItem<IResource>);
    }
  });
  return result;
}

function getAnchors(URLs: string[]) {
  return URLs.map(URL => (
    <a href={URL} target="_blank" rel="noopener noreferrer" key={URL}>
      {URL}
    </a>
  ));
}

function getNotes(resource?: IResource) {
  if (!resource) {
    return <span>Unknown</span>;
  }
  const ips: Array<{ ip: string }> = get(resource, "status.loadBalancer.ingress", []);
  if (ips.length) {
    return <span>IP(s): {ips.map(ip => ip.ip).join(", ")}</span>;
  }
  return (
    <span>
      Not associated with any IP.{" "}
      <Tooltip
        label="pending-tooltip"
        id={`${resource.metadata.name}-pending-tooltip`}
        icon="help"
        position="bottom-left"
        large={true}
        iconProps={{ solid: true, size: "sm" }}
      >
        Depending on your cloud provider of choice, it may take some time for an access URL to be
        available for the application and the Service will stay in a "Pending" state until a URL is
        assigned. If using Minikube, you will need to run <code>minikube tunnel</code> in your
        terminal in order for an IP address to be assigned to your application.
      </Tooltip>
    </span>
  );
}

export default function AccessURLTable({
  services,
  ingresses,
  ingressRefs,
  getResource,
}: IAccessURLTableProps) {
  useEffect(() => {
    // Fetch all related Ingress resources. We don't need to fetch Services as
    // they are expected to be watched by the ServiceTable.
    ingressRefs.forEach(r => getResource(r));
  }, [ingressRefs, getResource]);

  if (isSomeResourceLoading(ingresses.concat(services))) {
    return <LoadingWrapper loaded={false} />;
  }
  if (!hasItems(services, ingresses)) {
    return null;
  }

  let result = <p>The current application does not expose a public URL.</p>;
  const publicServices = filterPublicServices(services);
  if (publicServices.length > 0 || ingresses.length > 0) {
    const columns = [
      {
        accessor: "url",
        Header: "URL",
      },
      {
        accessor: "type",
        Header: "Type",
      },
      {
        accessor: "notes",
        Header: "Notes",
      },
    ];
    const allIngresses = flattenIngresses(ingresses);
    const data = publicServices
      .map(svc => {
        const urlItem = GetURLItemFromService(svc.item);
        return {
          url: urlItem.isLink ? getAnchors(urlItem.URLs) : urlItem.URLs.join(","),
          type: urlItem.type,
          notes: svc.error ? <span>Error: {svc.error.message}</span> : getNotes(svc.item),
        };
      })
      .concat(
        allIngresses.map(ingress => {
          return {
            url: ingress.item ? getAnchors(GetURLItemFromIngress(ingress.item).URLs) : "Unkown",
            type: "Ingress",
            notes: ingress.error ? (
              <span>Error: {ingress.error.message}</span>
            ) : (
              getNotes(ingress.item)
            ),
          };
        }),
      );
    result = <Table data={data} columns={columns} />;
  }
  return (
    <section aria-labelledby="access-urls-title">
      <h6 id="access-urls-title">Access URLs</h6>
      {result}
    </section>
  );
}